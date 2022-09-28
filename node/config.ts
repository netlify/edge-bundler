import { Buffer } from 'buffer'
import { pathToFileURL } from 'url'

import { DenoBridge } from './bridge.js'
import { EdgeFunction } from './edge_function.js'

export interface FunctionConfig {
  path?: string
}

export const getFunctionConfig = async (func: EdgeFunction, deno: DenoBridge) => {
  const script = `
    import * as func from "${pathToFileURL(func.path).href}";

    if (typeof func.config === "function") {
      try {
        const result = await func.config();

        console.log(JSON.stringify(result));
      } catch (error) {
        console.error(error);
      }
    } else {
      console.log(JSON.stringify({}));
    }
  `
  const scriptURL = `data:application/javascript;base64,${Buffer.from(script).toString('base64')}`
  const { stdout } = await deno.run(['run', '--allow-read', '--quiet', scriptURL])

  try {
    return JSON.parse(stdout) as FunctionConfig
  } catch {
    return {}
  }
}
