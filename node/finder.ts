import { promises as fs } from 'fs'
import { basename, extname, join } from 'path'

import { EdgeFunction } from './edge_function.js'
import { nonNullable } from './utils/non_nullable.js'

// the order of the allowed extensions is also the order we remove duplicates
// with a lower index meaning a higher precedence over the others
const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])

const removeDuplicatesByExtension = (functions: EdgeFunction[]) => {
  const seen = new Map()

  return functions.reduce((acc, { name, path }) => {
    const ext = extname(path)
    const extIndex = [...ALLOWED_EXTENSIONS].indexOf(ext)

    if (!seen.has(name) || seen.get(name) > extIndex) {
      seen.set(name, extIndex)
      return [...acc, { name, path }]
    }

    return acc
  }, [] as EdgeFunction[])
}

const findFunctionInDirectory = async (directory: string): Promise<EdgeFunction | undefined> => {
  const name = basename(directory)
  const candidatePaths = [...ALLOWED_EXTENSIONS]
    .flatMap((extension) => [`${name}${extension}`, `index${extension}`])
    .map((filename) => join(directory, filename))

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

  return {
    name,
    path: functionPath,
  }
}

const findFunctionInPath = async (path: string): Promise<EdgeFunction | undefined> => {
  const stats = await fs.stat(path)

  if (stats.isDirectory()) {
    return findFunctionInDirectory(path)
  }

  const extension = extname(path)

  if (ALLOWED_EXTENSIONS.has(extension)) {
    return { name: basename(path, extension), path }
  }
}

const findFunctionsInDirectory = async (baseDirectory: string) => {
  let items: string[] = []

  try {
    items = await fs.readdir(baseDirectory)
  } catch {
    // no-op
  }

  const functions = await Promise.all(items.map((item) => findFunctionInPath(join(baseDirectory, item))))

  return functions.filter(nonNullable)
}

const findFunctions = async (directories: string[]) => {
  const functions = await Promise.all(directories.map(findFunctionsInDirectory))

  return removeDuplicatesByExtension(functions.flat())
}

export { findFunctions }
