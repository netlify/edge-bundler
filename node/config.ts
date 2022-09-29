import { promises as fs } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

import tmp from 'tmp-promise'

import { DenoBridge } from './bridge.js'
import { EdgeFunction } from './edge_function.js'
import { Logger } from './logger.js'
import { getPackagePath } from './package_json.js'

// eslint-disable-next-line no-shadow
enum ConfigExitCode {
  Success = 0,
  UnhandledError = 1,
  ImportError,
  NoConfig,
  InvalidExport,
  RuntimeError,
  SerializationError,
}

export interface FunctionConfig {
  path?: string
}

const getConfigExtractor = () => {
  const packagePath = getPackagePath()
  const configExtractorPath = join(packagePath, 'deno', 'config.ts')

  return configExtractorPath
}

export const getFunctionConfig = async (func: EdgeFunction, deno: DenoBridge, log: Logger) => {
  const collector = await tmp.file()
  const extractorPath = getConfigExtractor()
  const { exitCode, stderr, stdout } = await deno.run(
    [
      'run',
      '--allow-read',
      `--allow-write=${collector.path}`,
      '--quiet',
      extractorPath,
      pathToFileURL(func.path).href,
      pathToFileURL(collector.path).href,
      JSON.stringify(ConfigExitCode),
    ],
    { rejectOnExitCode: false },
  )

  if (exitCode !== ConfigExitCode.Success) {
    logConfigError(func, exitCode, stderr, log)

    return {}
  }

  if (stdout !== '') {
    log.user(stdout)
  }

  try {
    const collectorData = await fs.readFile(collector.path, 'utf8')

    return JSON.parse(collectorData) as FunctionConfig
  } catch {
    logConfigError(func, ConfigExitCode.UnhandledError, stderr, log)

    return {}
  } finally {
    await collector.cleanup()
  }
}

const logConfigError = (func: EdgeFunction, exitCode: number, stderr: string, log: Logger) => {
  switch (exitCode) {
    case ConfigExitCode.ImportError:
      log.user(`Could not load edge function at '${func.path}'`)
      log.system(stderr)

      break

    case ConfigExitCode.NoConfig:
      log.system(`No in-source config found for edge function at '${func.path}'`)

      break

    case ConfigExitCode.InvalidExport:
      log.user(`'config' export in edge function at '${func.path}' must be a function`)

      break

    case ConfigExitCode.RuntimeError:
      log.user(`Error while running 'config' function in edge function at '${func.path}'`)
      log.user(stderr)

      break

    case ConfigExitCode.SerializationError:
      log.user(`'config' function in edge function at '${func.path}' must return an object with primitive values only`)

      break

    default:
      log.user(`Could not load configuration for edge function at '${func.path}'`)
      log.user(stderr)
  }
}
