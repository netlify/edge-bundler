import { build, LoadResponse } from 'https://deno.land/x/eszip@v0.28.0/mod.ts'

import * as path from 'https://deno.land/std@0.127.0/path/mod.ts'

import type { InputFunction, WriteStage2Options } from '../../shared/stage2.ts'
import { PUBLIC_SPECIFIER, STAGE2_SPECIFIER, virtualRoot } from './consts.ts'
import { inlineModule, loadFromVirtualRoot, loadWithRetry } from './common.ts'

interface FunctionReference {
  exportLine: string
  importLine: string
  name: string
}

const getFunctionReference = (basePath: string, func: InputFunction, index: number): FunctionReference => {
  const importName = `func${index}`
  const url = getVirtualPath(basePath, func.path)
  const exportLine = `"${func.name}": {"handler": ${importName}, "url": ${JSON.stringify(url)}}`

  return {
    exportLine,
    importLine: `import ${importName} from "${url}";`,
    name: func.name,
  }
}

export const getStage2Entry = (basePath: string, functions: InputFunction[]) => {
  const lines = functions.map((func, index) => getFunctionReference(basePath, func, index))
  const importLines = lines.map(({ importLine }) => importLine).join('\n')
  const exportLines = lines.map(({ exportLine }) => exportLine).join(', ')
  const functionsExport = `export const functions = {${exportLines}};`

  return [importLines, functionsExport].join('\n\n')
}

const getVirtualPath = (basePath: string, filePath: string) => {
  const relativePath = path.relative(basePath, filePath)
  const url = new URL(relativePath, virtualRoot)

  return url
}

const stage2Loader = (basePath: string, functions: InputFunction[]) => {
  return async (specifier: string): Promise<LoadResponse | undefined> => {
    if (specifier === STAGE2_SPECIFIER) {
      const stage2Entry = getStage2Entry(basePath, functions)

      return inlineModule(specifier, stage2Entry)
    }

    if (specifier === PUBLIC_SPECIFIER) {
      return {
        kind: 'external',
        specifier,
      }
    }

    if (specifier.startsWith(virtualRoot)) {
      return loadFromVirtualRoot(specifier, virtualRoot, basePath)
    }

    return await loadWithRetry(specifier)
  }
}

const writeStage2 = async ({ basePath, destPath, functions, importMapURL }: WriteStage2Options) => {
  const loader = stage2Loader(basePath, functions)
  const bytes = await build([STAGE2_SPECIFIER], loader, importMapURL)

  return await Deno.writeFile(destPath, bytes)
}

export { writeStage2 }
