import { rm } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

import { build, Plugin as EsbuildPlugin } from 'esbuild'

import type { InputFunction } from '../shared/stage2.js'

import { DENO_VERSION_RANGE } from './bridge.js'
import { FeatureFlags } from './feature_flags.js'
import { ImportMap } from './import_map.js'

const getImportMapPlugin = (importMap: ImportMap, importPaths: Set<string>): EsbuildPlugin => ({
  name: 'importMapPlugin',
  setup(build) {
    importPaths.forEach((importKey) => {
      const filter = new RegExp(`^${importKey}`)

      build.onResolve({ filter }, (args) => {
        const url = importMap.resolve(args.path, args.importer)

        if (url !== null) {
          return {
            path: fileURLToPath(url),
          }
        }
      })
    })
  },
})

interface PreBundleOptions {
  featureFlags: FeatureFlags
  functions: InputFunction[]
  importMap: ImportMap
  preBundlePath: string
}

export const cleanPreBundleDirectory = async (preBundlePath: string, featureFlags: FeatureFlags) => {
  if (!featureFlags.edge_functions_bundle_esbuild) {
    return
  }

  await rm(preBundlePath, { force: true, recursive: true, maxRetries: 10 })
}

export const preBundle = async ({ featureFlags, functions, importMap, preBundlePath }: PreBundleOptions) => {
  const mappings = new Map<string, string>()

  if (!featureFlags.edge_functions_bundle_esbuild) {
    return { functions, mappings }
  }

  const { imports, scopes } = importMap.getContents()
  const importPaths = new Set(Object.keys(imports))
  const entryPoints = functions.map(({ name, path }) => ({ in: path, out: join(preBundlePath, name) }))

  Object.keys(scopes).forEach((scope) => {
    Object.keys(scopes[scope]).forEach((path) => {
      importPaths.add(path)
    })
  })

  const denoVersion = DENO_VERSION_RANGE.slice(1)
  const target = `deno${denoVersion}`

  await build({
    bundle: true,
    entryPoints,
    format: 'esm',
    outdir: preBundlePath,
    platform: 'node',
    plugins: [getImportMapPlugin(importMap, importPaths)],
    target,
    write: true,
  })

  const newFunctions = functions.map(({ name, path }) => {
    const newPath = join(preBundlePath, `${name}.js`)

    mappings.set(path, newPath)

    return { name, path: newPath }
  })

  return {
    functions: newFunctions,
    mappings,
  }
}
