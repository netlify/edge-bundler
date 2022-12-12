import { promises as fs } from 'fs'
import { join, resolve } from 'path'

import { parse as parseJSONC } from 'jsonc-parser'

import { isNodeError } from './utils/error.js'

interface DenoConfigFile {
  importMap?: string
}

const filenames = ['deno.json', 'deno.jsonc']

export const getConfig = async (basePath?: string) => {
  if (basePath === undefined) {
    return
  }

  for (const filename of filenames) {
    const candidatePath = join(basePath, filename)
    const config = await getConfigFromFile(candidatePath)

    if (config !== undefined) {
      return normalizeConfig(config, basePath)
    }
  }
}

const getConfigFromFile = async (filePath: string) => {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const config = parseJSONC(data) as DenoConfigFile

    return config
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }

    return {}
  }
}

const normalizeConfig = (config: DenoConfigFile, basePath: string) => {
  const newConfig = { ...config }

  if (newConfig.importMap) {
    newConfig.importMap = resolve(basePath, newConfig.importMap)
  }

  return newConfig
}
