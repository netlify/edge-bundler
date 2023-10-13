import { promises as fs } from 'fs'
import { builtinModules, createRequire } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { resolve, ParsedImportMap } from '@import-maps/resolve'
import { nodeFileTrace, resolve as nftResolve } from '@vercel/nft'
import { build, OnResolveResult, Plugin } from 'esbuild'
import getPackageName from 'get-package-name'
import tmp from 'tmp-promise'

import { nodePrefix, npmPrefix } from '../shared/consts.js'

import { ImportMap } from './import_map.js'
import { Logger } from './logger.js'

const builtinModulesSet = new Set(builtinModules)
const require = createRequire(import.meta.url)
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.cts', 'mjs'])

// Workaround for https://github.com/evanw/esbuild/issues/1921.
const banner = {
  js: `
  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  `,
}

// esbuild plugin that will traverse the code and look for imports of external
// dependencies (i.e. Node modules). It stores the specifiers found in the Set
// provided.
export const getDependencyTrackerPlugin = (
  specifiers: Set<string>,
  importMap: ParsedImportMap,
  baseURL: URL,
): Plugin => ({
  name: 'dependency-tracker',
  setup(build) {
    build.onResolve({ filter: /^(.*)$/ }, (args) => {
      if (args.kind !== 'import-statement') {
        return
      }

      const result: Partial<OnResolveResult> = {}

      let specifier = args.path

      // Start by checking whether the specifier matches any import map defined
      // by the user.
      const { matched, resolvedImport } = resolve(specifier, importMap, baseURL)

      // If it does, the resolved import is the specifier we'll evaluate going
      // forward.
      if (matched) {
        if (resolvedImport.protocol !== 'file:') {
          return { external: true }
        }

        specifier = fileURLToPath(resolvedImport).replace(/\\/g, '/')

        result.path = specifier
      }

      // If the specifier is a Node.js built-in, we don't want to bundle it.
      if (specifier.startsWith(nodePrefix) || builtinModulesSet.has(specifier)) {
        return { external: true }
      }

      // We don't support the `npm:` prefix yet. Mark the specifier as external
      // and the ESZIP bundler will handle the failure.
      if (specifier.startsWith(npmPrefix)) {
        return { external: true }
      }

      const isLocalImport = specifier.startsWith(path.sep) || specifier.startsWith('.') || path.isAbsolute(specifier)

      // If this is a local import, return so that esbuild visits that path.
      if (isLocalImport) {
        return result
      }

      const isRemoteURLImport = specifier.startsWith('https://') || specifier.startsWith('http://')

      if (isRemoteURLImport) {
        return { external: true }
      }

      // At this point we know we're dealing with a bare specifier that should
      // be treated as an external module. We first try to resolve it, because
      // in the event that it doesn't exist (e.g. user is referencing a module
      // that they haven't installed) we won't even attempt to bundle it. This
      // lets the ESZIP bundler handle and report the missing import instead of
      // esbuild, which is a better experience for the user.
      try {
        require.resolve(specifier, { paths: [args.resolveDir] })

        specifiers.add(specifier)
      } catch {
        // no-op
      }

      // Mark the specifier as external, because we don't want to traverse the
      // entire module tree — i.e. if user code imports module `foo` and that
      // imports `bar`, we only want to add `foo` to the list of specifiers,
      // since the whole module — including its dependencies like `bar` —
      // will be bundled.
      return { external: true }
    })
  },
})

/**
 * Parses a set of functions and returns a list of specifiers that correspond
 * to npm modules.
 *
 * @param basePath Root of the project
 * @param functions Functions to parse
 * @param importMap Import map to apply when resolving imports
 */
const getNPMSpecifiers = async (basePath: string, functions: string[], importMap: ParsedImportMap) => {
  const baseURL = pathToFileURL(basePath)
  const { reasons } = await nodeFileTrace(functions, {
    base: basePath,
    readFile: async (filePath: string) => {
      // If this is a TypeScript file, we need to compile in before we can
      // parse it.
      if (TYPESCRIPT_EXTENSIONS.has(path.extname(filePath))) {
        const compiled = await build({
          bundle: false,
          entryPoints: [filePath],
          logLevel: 'silent',
          platform: 'node',
          write: false,
        })

        return compiled.outputFiles[0].text
      }

      return fs.readFile(filePath, 'utf8')
    },
    // eslint-disable-next-line require-await
    resolve: async (specifier, ...args) => {
      // Start by checking whether the specifier matches any import map defined
      // by the user.
      const { matched, resolvedImport } = resolve(specifier, importMap, baseURL)

      // If it does, the resolved import is the specifier we'll evaluate going
      // forward.
      if (matched && resolvedImport.protocol === 'file:') {
        const newSpecifier = fileURLToPath(resolvedImport).replace(/\\/g, '/')

        return newSpecifier
      }

      return nftResolve(specifier, ...args)
    },
  })
  const npmSpecifiers = new Set<string>()
  const modulesWithExtraneousFiles = new Set<string>()

  reasons.forEach((reason, path) => {
    const packageName = getPackageName(path)

    if (packageName === undefined) {
      return
    }

    const parents = [...reason.parents]
    const isDirectDependency = parents.some((path) => !path.startsWith('node_modules/'))

    // We're only interested in capturing the specifiers that are first-level
    // dependencies. Because we'll bundle all modules in a subsequent step,
    // any transitive dependencies will be handled then.
    if (isDirectDependency) {
      const specifier = getPackageName(path)

      npmSpecifiers.add(specifier)
    }

    const isExtraneousFile = reason.type.every((type) => type === 'asset')

    // An extraneous file is a dependency that was traced by NFT and marked
    // as not being statically imported. We can't process dynamic importing
    // at runtime, so we gather the list of modules that may use these files
    // so that we can warn users about this caveat.
    if (isExtraneousFile) {
      parents.forEach((path) => {
        const specifier = getPackageName(path)

        if (specifier) {
          modulesWithExtraneousFiles.add(specifier)
        }
      })
    }
  })

  return {
    modulesWithExtraneousFiles: [...modulesWithExtraneousFiles],
    npmSpecifiers: [...npmSpecifiers],
  }
}

interface VendorNPMSpecifiersOptions {
  basePath: string
  directory?: string
  functions: string[]
  importMap: ImportMap
  logger: Logger
}

export const vendorNPMSpecifiers = async ({
  basePath,
  directory,
  functions,
  importMap,
  logger,
}: VendorNPMSpecifiersOptions) => {
  // The directories that esbuild will use when resolving Node modules. We must
  // set these manually because esbuild will be operating from a temporary
  // directory that will not live inside the project root, so the normal
  // resolution logic won't work.
  const nodePaths = [path.join(basePath, 'node_modules')]

  // We need to create some files on disk, which we don't want to write to the
  // project directory. If a custom directory has been specified, we use it.
  // Otherwise, create a random temporary directory.
  const temporaryDirectory = directory ? { path: directory } : await tmp.dir()

  const { modulesWithExtraneousFiles, npmSpecifiers } = await getNPMSpecifiers(
    basePath,
    functions,
    importMap.getContentsWithURLObjects(),
  )

  if (modulesWithExtraneousFiles.length !== 0) {
    logger.user(
      `These npm modules, imported directly or indirectly by an edge function, appear to dynamically import files at runtime, which is currently not supported (https://ntl.fyi/edge-npm): ${modulesWithExtraneousFiles.join(
        ', ',
      )}`,
    )
  }

  // If we found no specifiers, there's nothing left to do here.
  if (npmSpecifiers.length === 0) {
    return
  }

  // To bundle an entire module and all its dependencies, create a barrel file
  // where we re-export everything from that specifier. We do this for every
  // specifier, and each of these files will become entry points to esbuild.
  const ops = await Promise.all(
    npmSpecifiers.map(async (specifier, index) => {
      const code = `import * as mod from "${specifier}"; export default mod.default; export * from "${specifier}";`
      const filePath = path.join(temporaryDirectory.path, `barrel-${index}.js`)

      await fs.writeFile(filePath, code)

      return { filePath, specifier }
    }),
  )
  const entryPoints = ops.map(({ filePath }) => filePath)

  // Bundle each of the barrel files we created. We'll end up with a compiled
  // version of each of the barrel files, plus any chunks of shared code
  // between them (such that a common module isn't bundled twice).
  await build({
    allowOverwrite: true,
    banner,
    bundle: true,
    entryPoints,
    format: 'esm',
    logLevel: 'error',
    nodePaths,
    outdir: temporaryDirectory.path,
    platform: 'node',
    splitting: true,
    target: 'es2020',
  })

  // Add all Node.js built-ins to the import map, so any unprefixed specifiers
  // (e.g. `process`) resolve to the prefixed versions (e.g. `node:prefix`),
  // which Deno can process.
  const builtIns = builtinModules.reduce(
    (acc, name) => ({
      ...acc,
      [name]: `node:${name}`,
    }),
    {} as Record<string, string>,
  )

  // Creates an object that is compatible with the `imports` block of an import
  // map, mapping specifiers to the paths of their bundled files on disk. Each
  // specifier gets two entries in the import map, one with the `npm:` prefix
  // and one without, such that both options are supported.
  const newImportMap = {
    baseURL: pathToFileURL(temporaryDirectory.path),
    imports: ops.reduce((acc, op) => {
      const url = pathToFileURL(op.filePath).toString()

      return {
        ...acc,
        [op.specifier]: url,
      }
    }, builtIns),
  }

  const cleanup = async () => {
    // If a custom temporary directory was specified, we leave the cleanup job
    // up to the caller.
    if (directory) {
      return
    }

    try {
      await fs.rm(temporaryDirectory.path, { force: true, recursive: true })
    } catch {
      // no-op
    }
  }

  return {
    cleanup,
    directory: temporaryDirectory.path,
    importMap: newImportMap,
  }
}
