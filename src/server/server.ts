import { tmpName } from 'tmp-promise'

import { DenoBridge, OnAfterDownloadHook, OnBeforeDownloadHook, ProcessRef } from '../bridge.js'
import type { EdgeFunction } from '../edge_function.js'
import { generateStage2 } from '../formats/javascript.js'
import { ImportMap, ImportMapFile } from '../import_map.js'
import { ensureLatestTypes } from '../types.js'

import { killProcess, waitForServer } from './util.js'

type FormatFunction = (name: string) => string

interface PrepareServerOptions {
  deno: DenoBridge
  distDirectory: string
  entryPoint?: string
  flags: string[]
  formatExportTypeError?: FormatFunction
  formatImportError?: FormatFunction
  port: number
}

const prepareServer = ({
  deno,
  distDirectory,
  flags: denoFlags,
  formatExportTypeError,
  formatImportError,
  port,
}: PrepareServerOptions) => {
  const processRef: ProcessRef = {}
  const startIsolate = async (newFunctions: EdgeFunction[]) => {
    if (processRef?.ps !== undefined) {
      await killProcess(processRef.ps)
    }

    let graph

    const stage2Path = await generateStage2({
      distDirectory,
      fileName: 'dev.js',
      functions: newFunctions,
      formatExportTypeError,
      formatImportError,
      type: 'local',
    })

    try {
      // This command will print a JSON object with all the modules found in
      // the `stage2Path` file as well as all of their dependencies.
      // Consumers such as the CLI can use this information to watch all the
      // relevant files and issue an isolate restart when one of them changes.
      const { stdout } = await deno.run(['info', '--json', stage2Path])

      graph = JSON.parse(stdout)
    } catch {
      // no-op
    }

    const bootstrapFlags = ['--port', port.toString()]

    await deno.runInBackground(['run', ...denoFlags, stage2Path, ...bootstrapFlags], true, processRef)

    const success = await waitForServer(port, processRef.ps)

    return {
      graph,
      success,
    }
  }

  return startIsolate
}

interface InspectSettings {
  // Inspect mode enabled
  enabled: boolean

  // Pause on breakpoints (i.e. "--brk")
  pause: boolean

  // Host/port override (optional)
  address?: string
}
interface ServeOptions {
  certificatePath?: string
  debug?: boolean
  distImportMapPath?: string
  inspectSettings?: InspectSettings
  importMaps?: ImportMapFile[]
  onAfterDownload?: OnAfterDownloadHook
  onBeforeDownload?: OnBeforeDownloadHook
  formatExportTypeError?: FormatFunction
  formatImportError?: FormatFunction
  port: number
}

const serve = async ({
  certificatePath,
  debug,
  distImportMapPath,
  inspectSettings,
  formatExportTypeError,
  formatImportError,
  importMaps,
  onAfterDownload,
  onBeforeDownload,
  port,
}: ServeOptions) => {
  const deno = new DenoBridge({
    debug,
    onAfterDownload,
    onBeforeDownload,
  })

  // We need to generate a stage 2 file and write it somewhere. We use a
  // temporary directory for that.
  const distDirectory = await tmpName()

  // Wait for the binary to be downloaded if needed.
  await deno.getBinaryPath()

  // Downloading latest types if needed.
  await ensureLatestTypes(deno)

  // Creating an ImportMap instance with any import maps supplied by the user,
  // if any.
  const importMap = new ImportMap(importMaps)
  const flags = [
    '--allow-all',
    '--unstable',
    `--import-map=${importMap.toDataURL()}`,
    '--v8-flags=--disallow-code-generation-from-strings',
  ]

  if (certificatePath) {
    flags.push(`--cert=${certificatePath}`)
  }

  if (debug) {
    flags.push('--log-level=debug')
  } else {
    flags.push('--quiet')
  }

  if (inspectSettings && inspectSettings.enabled) {
    if (inspectSettings.pause) {
      flags.push(inspectSettings.address ? `--inspect-brk=${inspectSettings.address}` : '--inspect-brk')
    } else {
      flags.push(inspectSettings.address ? `--inspect=${inspectSettings.address}` : '--inspect')
    }
  }

  const server = await prepareServer({
    deno,
    distDirectory,
    flags,
    formatExportTypeError,
    formatImportError,
    port,
  })

  if (distImportMapPath) {
    await importMap.writeToFile(distImportMapPath)
  }

  return server
}

export { serve }
export type { FormatFunction }
