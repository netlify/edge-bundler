import { promises as fs } from 'fs'
import path from 'path'
import process from 'process'

import { execa, ExecaChildProcess, Options } from 'execa'
import pathKey from 'path-key'
import semver from 'semver'

import { download } from './downloader.js'
import { getPathInHome } from './home_path.js'
import { getLogger, Logger } from './logger.js'
import { getBinaryExtension } from './platform.js'

const DENO_VERSION_FILE = 'version.txt'
// When updating DENO_VERSION_RANGE, ensure that the deno version installed in the
// build-image/buildbot does satisfy this range!
const DENO_VERSION_RANGE = '^1.32.0'

type OnBeforeDownloadHook = () => void | Promise<void>
type OnAfterDownloadHook = (error?: Error) => void | Promise<void>

interface DenoOptions {
  cacheDirectory?: string
  debug?: boolean
  denoDir?: string
  logger?: Logger
  onAfterDownload?: OnAfterDownloadHook
  onBeforeDownload?: OnBeforeDownloadHook
  useGlobal?: boolean
  versionRange?: string
}

interface ProcessRef {
  ps?: ExecaChildProcess<string>
}

interface RunOptions {
  pipeOutput?: boolean
  env?: NodeJS.ProcessEnv
  extendEnv?: boolean
  rejectOnExitCode?: boolean
}

class DenoBridge {
  cacheDirectory: string
  currentDownload?: ReturnType<DenoBridge['downloadBinary']>
  debug: boolean
  denoDir?: string
  logger: Logger
  onAfterDownload?: OnAfterDownloadHook
  onBeforeDownload?: OnBeforeDownloadHook
  useGlobal: boolean
  versionRange: string

  constructor(options: DenoOptions) {
    this.cacheDirectory = options.cacheDirectory ?? getPathInHome('deno-cli')
    this.debug = options.debug ?? false
    this.denoDir = options.denoDir
    this.logger = options.logger ?? getLogger(undefined, options.debug)
    this.onAfterDownload = options.onAfterDownload
    this.onBeforeDownload = options.onBeforeDownload
    this.useGlobal = options.useGlobal ?? true
    this.versionRange = options.versionRange ?? DENO_VERSION_RANGE
  }

  private async downloadBinary() {
    await this.onBeforeDownload?.()

    await this.ensureCacheDirectory()

    this.logger.system(`Downloading Deno CLI to ${this.cacheDirectory}`)

    const binaryPath = await download(this.cacheDirectory, this.versionRange, this.logger)
    const downloadedVersion = await this.getBinaryVersion(binaryPath)

    // We should never get here, because it means that `DENO_VERSION_RANGE` is
    // a malformed semver range. If this does happen, let's throw an error so
    // that the tests catch it.
    if (downloadedVersion === undefined) {
      const error = new Error(
        'There was a problem setting up the Edge Functions environment. To try a manual installation, visit https://ntl.fyi/install-deno.',
      )

      await this.onAfterDownload?.(error)

      this.logger.system('Could not run downloaded Deno CLI', error)

      throw error
    }

    await this.writeVersionFile(downloadedVersion)

    await this.onAfterDownload?.()

    return binaryPath
  }

  private async getBinaryVersion(binaryPath: string) {
    try {
      const { stdout } = await execa(binaryPath, ['--version'])
      const version = stdout.match(/^deno ([\d.]+)/)

      if (!version) {
        this.logger.system(`getBinaryVersion no version found. binaryPath ${binaryPath}`)
        return
      }

      return version[1]
    } catch (error) {
      this.logger.system('getBinaryVersion failed', error)
    }
  }

  private async getCachedBinary() {
    const versionFilePath = path.join(this.cacheDirectory, DENO_VERSION_FILE)

    let cachedVersion

    try {
      cachedVersion = await fs.readFile(versionFilePath, 'utf8')
    } catch (error) {
      this.logger.system('Error getting cached binary', error)
      return
    }

    if (!semver.satisfies(cachedVersion, this.versionRange)) {
      this.logger.system(`semver not satisfied. cachedVersion: ${cachedVersion}, versionRange: ${this.versionRange}`)
      return
    }

    const binaryName = `deno${getBinaryExtension()}`

    return path.join(this.cacheDirectory, binaryName)
  }

  private async getGlobalBinary() {
    if (!this.useGlobal) {
      return
    }

    const globalBinaryName = 'deno'
    const globalVersion = await this.getBinaryVersion(globalBinaryName)

    if (globalVersion === undefined || !semver.satisfies(globalVersion, this.versionRange)) {
      this.logger.system(
        `No globalVersion or semver not satisfied. globalVersion: ${globalVersion}, versionRange: ${this.versionRange}`,
      )
      return
    }

    return globalBinaryName
  }

  private getRemoteBinary() {
    if (this.currentDownload === undefined) {
      this.currentDownload = this.downloadBinary()
    }

    return this.currentDownload
  }

  private static runWithBinary(binaryPath: string, args: string[], options?: Options, pipeOutput?: boolean) {
    const runDeno = execa(binaryPath, args, options)

    if (pipeOutput) {
      runDeno.stdout?.pipe(process.stdout)
      runDeno.stderr?.pipe(process.stderr)
    }

    return runDeno
  }

  private async writeVersionFile(version: string) {
    await this.ensureCacheDirectory()

    const versionFilePath = path.join(this.cacheDirectory, DENO_VERSION_FILE)

    await fs.writeFile(versionFilePath, version)
  }

  async ensureCacheDirectory() {
    await fs.mkdir(this.cacheDirectory, { recursive: true })
  }

  async getBinaryPath() {
    const globalPath = await this.getGlobalBinary()

    if (globalPath !== undefined) {
      this.logger.system('Using global installation of Deno CLI')

      return { global: true, path: globalPath }
    }

    const cachedPath = await this.getCachedBinary()

    if (cachedPath !== undefined) {
      this.logger.system('Using cached Deno CLI from', cachedPath)

      return { global: false, path: cachedPath }
    }

    const downloadedPath = await this.getRemoteBinary()

    return { global: false, path: downloadedPath }
  }

  getEnvironmentVariables(inputEnv: NodeJS.ProcessEnv = {}) {
    const env: NodeJS.ProcessEnv = { ...inputEnv }

    if (this.denoDir !== undefined) {
      env.DENO_DIR = this.denoDir
    }

    // Ensure PATH is always set as otherwise we are not able to find the global deno binary
    env[pathKey()] = inputEnv[pathKey({ env: inputEnv })] || process.env[pathKey()]

    return env
  }

  // Runs the Deno CLI in the background and returns a reference to the child
  // process, awaiting its execution.
  async run(args: string[], { pipeOutput, env: inputEnv, extendEnv = true, rejectOnExitCode = true }: RunOptions = {}) {
    const { path: binaryPath } = await this.getBinaryPath()
    const env = this.getEnvironmentVariables(inputEnv)
    const options: Options = { env, extendEnv, reject: rejectOnExitCode }

    return DenoBridge.runWithBinary(binaryPath, args, options, pipeOutput)
  }

  // Runs the Deno CLI in the background, assigning a reference of the child
  // process to a `ps` property in the `ref` argument, if one is supplied.
  async runInBackground(
    args: string[],
    ref?: ProcessRef,
    { pipeOutput, env: inputEnv, extendEnv = true }: RunOptions = {},
  ) {
    const { path: binaryPath } = await this.getBinaryPath()
    const env = this.getEnvironmentVariables(inputEnv)
    const options: Options = { env, extendEnv }
    const ps = DenoBridge.runWithBinary(binaryPath, args, options, pipeOutput)

    if (ref !== undefined) {
      // eslint-disable-next-line no-param-reassign
      ref.ps = ps
    }
  }
}

export { DENO_VERSION_RANGE, DenoBridge }
export type { DenoOptions, OnAfterDownloadHook, OnBeforeDownloadHook, ProcessRef }
