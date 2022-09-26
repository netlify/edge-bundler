import { promises as fs } from 'fs'
import { join } from 'path'

import globToRegExp from 'glob-to-regexp'

import type { Bundle } from './bundle.js'
import type { Declaration } from './declaration.js'
import { EdgeFunction } from './edge_function.js'
import { getPackageVersion } from './package_json.js'

interface GenerateManifestOptions {
  bundles?: Bundle[]
  functions: EdgeFunction[]
  declarations?: Declaration[]
}

interface PreCacheRoute {
  function: string
  pattern: string
}

interface PostCacheRoute {
  function: string
}

/* eslint-disable camelcase */
interface Manifest {
  bundler_version: string
  bundles: { asset: string; format: string }[]
  routes: PreCacheRoute[]
  post_cache_routes: PostCacheRoute[]
}
/* eslint-enable camelcase */

const generateManifest = ({ bundles = [], declarations = [], functions }: GenerateManifestOptions) => {
  const preCacheRoutes: PreCacheRoute[] = []
  const postCacheRoutes: PostCacheRoute[] = []
  const functionsProcessed: Set<string> = new Set()

  // To gather the pre-cache routes, we go through all the declarations (order
  // matters), and pick the ones with a matching function and a pattern.
  declarations.forEach((declaration) => {
    const func = functions.find(({ name }) => declaration.function === name)

    if (func === undefined) {
      return
    }

    const pattern = getRegularExpression(declaration)

    if (pattern === null) {
      return
    }

    const serializablePattern = pattern.source.replace(/\\\//g, '/')

    functionsProcessed.add(func.name)

    preCacheRoutes.push({
      function: func.name,
      pattern: serializablePattern,
    })
  })

  // Any functions that don't have a declaration with a pattern are treated as
  // post-cache functions.
  functions.forEach((func) => {
    if (functionsProcessed.has(func.name)) {
      return
    }

    postCacheRoutes.push({ function: func.name })
  })

  const manifestBundles = bundles.map(({ extension, format, hash }) => ({
    asset: hash + extension,
    format,
  }))
  const manifest: Manifest = {
    bundler_version: getPackageVersion(),
    bundles: manifestBundles,
    routes: preCacheRoutes,
    post_cache_routes: postCacheRoutes,
  }

  return manifest
}

const getRegularExpression = (declaration: Declaration) => {
  if ('pattern' in declaration) {
    return new RegExp(declaration.pattern)
  }

  if ('path' in declaration) {
    // We use the global flag so that `globToRegExp` will not wrap the expression
    // with `^` and `$`. We'll do that ourselves.
    const regularExpression = globToRegExp(declaration.path, { flags: 'g' })

    // Wrapping the expression source with `^` and `$`. Also, adding an optional
    // trailing slash, so that a declaration of `path: "/foo"` matches requests
    // for both `/foo` and `/foo/`.
    const normalizedSource = `^${regularExpression.source}\\/?$`

    return new RegExp(normalizedSource)
  }

  return null
}

interface WriteManifestOptions {
  bundles: Bundle[]
  declarations: Declaration[]
  distDirectory: string
  functions: EdgeFunction[]
}

const writeManifest = async ({ bundles, declarations = [], distDirectory, functions }: WriteManifestOptions) => {
  const manifest = generateManifest({ bundles, declarations, functions })
  const manifestPath = join(distDirectory, 'manifest.json')

  await fs.writeFile(manifestPath, JSON.stringify(manifest))

  return manifest
}

export { generateManifest, Manifest, writeManifest }
