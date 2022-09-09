import { Buffer } from 'buffer'
import { promises as fs } from 'fs'
import { dirname } from 'path'

import { parse } from '@import-maps/resolve'

const INTERNAL_IMPORTS = {
  'netlify:edge': 'https://edge.netlify.com/v1/index.ts',
}

interface ImportMapFile {
  baseURL: URL
  imports: Record<string, string>
  scopes?: Record<string, Record<string, string>>
}

class ImportMap {
  imports: Record<string, string>

  constructor(input: ImportMapFile[] = []) {
    const inputImports = input.reduce((acc, importMapFile) => {
      const { imports } = ImportMap.resolve(importMapFile)

      return {
        ...acc,
        ...imports,
      }
    }, {})

    // `INTERNAL_IMPORTS` must come last,
    // because we need to guarantee `netlify:edge` isn't user-defined.
    this.imports = { ...inputImports, ...INTERNAL_IMPORTS }
  }

  static resolve(importMapFile: ImportMapFile) {
    const { baseURL, ...importMap } = importMapFile

    // TODO: Add support for `scopes`.
    const { imports } = parse(importMap, baseURL)

    if (imports === undefined) {
      return { imports: {} }
    }

    const resolvedImports: Record<string, string> = Object.entries(imports).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value instanceof URL ? value.toString() : value,
      }),
      {},
    )

    return { imports: resolvedImports }
  }

  getContents() {
    const contents = {
      imports: this.imports,
    }

    return JSON.stringify(contents)
  }

  toDataURL() {
    const encodedImportMap = Buffer.from(this.getContents()).toString('base64')

    return `data:application/json;base64,${encodedImportMap}`
  }

  async writeToFile(path: string) {
    await fs.mkdir(dirname(path), { recursive: true })

    const contents = this.getContents()

    await fs.writeFile(path, contents)
  }
}

export { ImportMap }
export type { ImportMapFile }
