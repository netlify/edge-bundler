import { promises as fs } from 'fs'
import { join } from 'path'

import globToRegExp from 'glob-to-regexp'

import type { Bundle } from './bundle.js'
import type { Declaration } from './declaration.js'
import { EdgeFunction } from './edge_function.js'
import { getPackageVersion } from './package_json.js'
import { nonNullable } from './utils/non_nullable.js'

interface GenerateManifestOptions {
  bundles?: Bundle[]
  functions: EdgeFunction[]
  declarations?: Declaration[]
}

interface Manifest {
  // eslint-disable-next-line camelcase
  bundler_version: string
  bundles: { asset: string; format: string }[]
  routes: { function: string; pattern: string }[]
}

const generateManifest = ({ bundles = [], declarations = [], functions }: GenerateManifestOptions) => {
  const routes = declarations.map((declaration) => {
    const func = functions.find(({ name }) => declaration.function === name)

    if (func === undefined) {
      return
    }

    const pattern = getRegularExpression(declaration)
    const serializablePattern = pattern.source.replace(/\\\//g, '/')

    return {
      function: func.name,
      pattern: serializablePattern,
    }
  })
  const manifestBundles = bundles.map(({ extension, format, hash }) => ({
    asset: hash + extension,
    format,
  }))
  const manifest: Manifest = {
    bundles: manifestBundles,
    routes: routes.filter(nonNullable),
    bundler_version: getPackageVersion(),
  }

  return manifest
}

const getRegularExpression = (declaration: Declaration) => {
  if ('pattern' in declaration) {
    return new RegExp(declaration.pattern)
  }

  // We use the global flag so that `globToRegExp` will not wrap the expression
  // with `^` and `$`. We'll do that ourselves.
  const regularExpression = globToRegExp(declaration.path, { flags: 'g' })

  // Wrapping the expression source with `^` and `$`. Also, adding an optional
  // trailing slash, so that a declaration of `path: "/foo"` matches requests
  // for both `/foo` and `/foo/`.
  const normalizedSource = `^${regularExpression.source}\\/?$`

  return new RegExp(normalizedSource)
}

interface WriteManifestOptions {
  bundles: Bundle[]
  declarations: Declaration[]
  distDirectory: string
  functions: EdgeFunction[]
}

const writeManifest = ({ bundles, declarations = [], distDirectory, functions }: WriteManifestOptions) => {
  const manifest = generateManifest({ bundles, declarations, functions })
  const manifestPath = join(distDirectory, 'manifest.json')

  return fs.writeFile(manifestPath, JSON.stringify(manifest))
}

export { generateManifest, Manifest, writeManifest }
