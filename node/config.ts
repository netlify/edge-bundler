import { Buffer } from 'buffer'
import { promises as fs } from 'fs'
import { pathToFileURL } from 'url'

import tmp from 'tmp-promise'

import { DenoBridge } from './bridge.js'
import { EdgeFunction } from './edge_function.js'
import { Logger } from './logger.js'

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

export const getFunctionConfig = async (func: EdgeFunction, deno: DenoBridge, log: Logger) => {
  const collector = await tmp.file()
  const script = `
    const [ functionURL, collectorURL ] = Deno.args;

    let func;

    try {
      func = await import(functionURL);
    } catch {
      Deno.exit(${ConfigExitCode.ImportError});
    }

    if (func.config === undefined) {
      Deno.exit(${ConfigExitCode.NoConfig});
    }

    if (typeof func.config !== "function") {
      Deno.exit(${ConfigExitCode.InvalidExport});
    }

    let config;

    try {
      config = await func.config();
    } catch (error) {
      console.error(error);

      Deno.exit(${ConfigExitCode.RuntimeError});
    }

    try {
      const result = JSON.stringify(config);

      await Deno.writeTextFile(new URL(collectorURL), result);
    } catch (err) {
      Deno.exit(${ConfigExitCode.SerializationError});
    }
    
    Deno.exit(${ConfigExitCode.Success});
  `
  const scriptURL = `data:application/javascript;base64,${Buffer.from(script).toString('base64')}`
  const { exitCode } = await deno.run(
    [
      'run',
      '--allow-read',
      `--allow-write=${collector.path}`,
      '--quiet',
      scriptURL,
      pathToFileURL(func.path).href,
      pathToFileURL(collector.path).href,
    ],
    { pipeOutput: true, rejectOnExitCode: false },
  )

  switch (exitCode) {
    case ConfigExitCode.ImportError:
      log.user(`Could not load edge function at '${func.path}'`)

      return {}

    case ConfigExitCode.NoConfig:
      log.system(`No in-source config found for edge function at '${func.path}'`)

      return {}

    case ConfigExitCode.InvalidExport:
      log.user(`'config' export in edge function at '${func.path}' must be a function`)

      return {}

    case ConfigExitCode.RuntimeError:
      log.user(`Error while running 'config' function in edge function at '${func.path}'`)

      return {}

    case ConfigExitCode.SerializationError:
      log.user(`'config' function in edge function at '${func.path}' must return an object with primitive values only`)

      return {}

    default:
    // no-op
  }

  try {
    const collectorData = await fs.readFile(collector.path, 'utf8')

    return JSON.parse(collectorData) as FunctionConfig
  } catch {
    log.user(`Could not load configuration for edge function at '${func.path}'`)

    return {}
  } finally {
    await collector.cleanup()
  }
}
