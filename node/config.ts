import { Buffer } from 'buffer'
import { promises as fs } from 'fs'
import { pathToFileURL } from 'url'

import tmp from 'tmp-promise'

import { DenoBridge } from './bridge.js'
import { EdgeFunction } from './edge_function.js'

export interface FunctionConfig {
  path?: string
}

export const getFunctionConfig = async (func: EdgeFunction, deno: DenoBridge) => {
  const collector = await tmp.file()
  const script = `
    import * as func from "${pathToFileURL(func.path).href}";

    if (typeof func.config === "function") {
      try {
        const result = await func.config();
        const collectorURL = new URL("${pathToFileURL(collector.path).href}");

        await Deno.writeTextFile(collectorURL, JSON.stringify(result));
      } catch (error) {
        console.error(error);
      }
    }
  `
  const scriptURL = `data:application/javascript;base64,${Buffer.from(script).toString('base64')}`

  await deno.run(['run', '--allow-read', `--allow-write=${collector.path}`, '--quiet', scriptURL])

  try {
    // eslint-disable-next-line unicorn/prefer-json-parse-buffer
    const collectorData = await fs.readFile(collector.path, 'utf8')

    return JSON.parse(collectorData) as FunctionConfig
  } catch {
    return {}
  } finally {
    await collector.cleanup()
  }
}
