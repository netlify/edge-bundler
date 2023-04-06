import { promises as fs } from 'fs'
import { basename, extname, join, parse } from 'path'

import { EdgeFunction } from './edge_function.js'
import { nonNullable } from './utils/non_nullable.js'

// the order of the allowed extensions is also the order we remove duplicates
// with a lower index meaning a higher precedence over the others
const ALLOWED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

export const hasPrecedingDuplicate = (path: string, functionExtensions: Map<string, number>) => {
  const { ext, name } = parse(path)
  const extIndex = ALLOWED_EXTENSIONS.indexOf(ext)
  // @ts-expect-error functionExtensions might be empty
  if (!functionExtensions.has(name) || functionExtensions.get(name) > extIndex) {
    functionExtensions.set(name, extIndex)
    return false
  }
  return true
}

const findFunctionInDirectory = async (
  directory: string,
  functionExtensions: Map<string, number>,
): Promise<EdgeFunction | undefined> => {
  const name = basename(directory)
  const candidatePaths = ALLOWED_EXTENSIONS.flatMap((extension) => [`${name}${extension}`, `index${extension}`]).map(
    (filename) => join(directory, filename),
  )

  let functionPath

  for (const candidatePath of candidatePaths) {
    try {
      const stats = await fs.stat(candidatePath)

      // eslint-disable-next-line max-depth
      if (stats.isFile()) {
        functionPath = candidatePath

        break
      }
    } catch {
      // no-op
    }
  }

  if (functionPath === undefined) {
    return
  }

  if (hasPrecedingDuplicate(functionPath, functionExtensions)) return

  return {
    name,
    path: functionPath,
  }
}

const findFunctionInPath = async (
  path: string,
  functionExtensions: Map<string, number>,
): Promise<EdgeFunction | undefined> => {
  const stats = await fs.stat(path)

  if (stats.isDirectory()) {
    return findFunctionInDirectory(path, functionExtensions)
  }

  if (hasPrecedingDuplicate(path, functionExtensions)) return

  const extension = extname(path)

  if (ALLOWED_EXTENSIONS.includes(extension)) {
    return { name: basename(path, extension), path }
  }
}

const findFunctionsInDirectory = async (baseDirectory: string) => {
  let items: string[] = []
  const functionExtensions = new Map()

  try {
    items = await fs.readdir(baseDirectory)
  } catch {
    // no-op
  }

  const functions = await Promise.all(
    items.map((item) => findFunctionInPath(join(baseDirectory, item), functionExtensions)),
  )

  return functions.filter(nonNullable)
}

const findFunctions = async (directories: string[]) => {
  const functions = await Promise.all(directories.map(findFunctionsInDirectory))

  return functions.flat()
}

export { findFunctions }
