import { promises as fs } from 'fs'
import { builtinModules } from 'module'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { resolve, ParsedImportMap } from '@import-maps/resolve'
import { nodeFileTrace, resolve as nftResolve } from '@vercel/nft'
import { build } from 'esbuild'
import { findUp } from 'find-up'
import getPackageName from 'get-package-name'
import tmp from 'tmp-promise'

import { ImportMap } from './import_map.js'
import { Logger } from './logger.js'

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.cts', '.mts'])

/**
 * Turns @netlify/functions into @types/netlify__functions.
 */
const inferDefinitelyTypedPackage = (specifier: string) => {
  if (!specifier.startsWith('@')) return `@types/${specifier}`
  const [scope, pkg] = specifier.split('/')
  return `@types/${scope.replace('@', '')}__${pkg}`
}

const detectTypes = async (filePath: string): Promise<string | undefined> => {
  try {
    const packageJson = await findUp('package.json', { cwd: filePath })
    if (!packageJson) return
    const packageJsonContents = JSON.parse(await fs.readFile(packageJson, 'utf8'))
    // this only looks at `.types` and `.typings` fields. there might also be data in `exports -> . -> types -> import/default`.
    // we're ignoring that for now.
    const packageJsonTypes = packageJsonContents.types ?? packageJsonContents.typings
    if (packageJsonTypes) return join(packageJson, '..', packageJsonTypes)

    const nodeModulesFolder = await findUp('node_modules', { cwd: packageJson, type: 'directory' })
    if (!nodeModulesFolder) return

    const typesPackageJson = join(
      nodeModulesFolder,
      inferDefinitelyTypedPackage(packageJsonContents.name),
      'package.json',
    )
    const typesPackageContents = JSON.parse(await fs.readFile(typesPackageJson, 'utf8'))
    const typesPackageTypes = typesPackageContents.types ?? typesPackageContents.typings
    if (typesPackageContents) return join(typesPackageJson, '..', typesPackageTypes)
  } catch {}
}

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

        return nftResolve(newSpecifier, ...args)
      }

      return nftResolve(specifier, ...args)
    },
  })
  const npmSpecifiers: Record<string, { types?: string }> = {}
  const npmSpecifiersWithExtraneousFiles = new Set<string>()

  for (const [filePath, reason] of reasons.entries()) {
    const packageName = getPackageName(filePath)

    if (packageName === undefined) {
      continue
    }

    const parents = [...reason.parents]
    const isDirectDependency = parents.some((parentPath) => !parentPath.startsWith(`node_modules${path.sep}`))

    // We're only interested in capturing the specifiers that are first-level
    // dependencies. Because we'll bundle all modules in a subsequent step,
    // any transitive dependencies will be handled then.
    if (isDirectDependency) {
      const specifier = getPackageName(filePath)

      npmSpecifiers[specifier] = {
        types: await detectTypes(join(basePath, filePath)),
      }
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
          npmSpecifiersWithExtraneousFiles.add(specifier)
        }
      })
    }
  }

  return {
    npmSpecifiers,
    npmSpecifiersWithExtraneousFiles: [...npmSpecifiersWithExtraneousFiles],
  }
}

const prependFile = async (path: string, prefix: string) => {
  const existingContent = await fs.readFile(path, 'utf8')
  await fs.writeFile(path, prefix + existingContent)
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

  const { npmSpecifiers, npmSpecifiersWithExtraneousFiles } = await getNPMSpecifiers(
    basePath,
    functions,
    importMap.getContentsWithURLObjects(),
  )

  // If we found no specifiers, there's nothing left to do here.
  if (Object.keys(npmSpecifiers).length === 0) {
    return
  }

  // To bundle an entire module and all its dependencies, create a barrel file
  // where we re-export everything from that specifier. We do this for every
  // specifier, and each of these files will become entry points to esbuild.
  const ops = await Promise.all(
    Object.entries(npmSpecifiers).map(async ([specifier, { types }], index) => {
      const code = `import * as mod from "${specifier}"; export default mod.default; export * from "${specifier}";`
      const barrelName = `barrel-${index}.js`
      const filePath = path.join(temporaryDirectory.path, barrelName)

      await fs.writeFile(filePath, code)

      return { filePath, specifier, barrelName, types }
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

  for (const { barrelName, types } of ops) {
    if (!types) continue
    // we're updating the output instead of adding this to the input,
    // because esbuild will erase the directive while bundling
    await prependFile(path.join(temporaryDirectory.path, barrelName), `/// <reference types="${types}" />`)
  }

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
    npmSpecifiersWithExtraneousFiles,
  }
}
