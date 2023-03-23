import { promises as fs } from 'fs'
import { join } from 'path'

import commonPathPrefix from 'common-path-prefix'
import isPathInside from 'is-path-inside'
import { v4 as uuidv4 } from 'uuid'

import { importMapSpecifier } from '../shared/consts.js'

import { DenoBridge, DenoOptions, OnAfterDownloadHook, OnBeforeDownloadHook } from './bridge.js'
import type { Bundle } from './bundle.js'
import { FunctionConfig, getFunctionConfig } from './config.js'
import { Declaration, mergeDeclarations } from './declaration.js'
import { load as loadDeployConfig } from './deploy_config.js'
import { EdgeFunction } from './edge_function.js'
import { FeatureFlags, getFlags } from './feature_flags.js'
import { findFunctions } from './finder.js'
import { bundle as bundleESZIP } from './formats/eszip.js'
import { ImportMap } from './import_map.js'
import { getLogger, LogFunction } from './logger.js'
import { writeManifest } from './manifest.js'
import { ensureLatestTypes } from './types.js'

interface BundleOptions {
  basePath?: string
  cacheDirectory?: string
  configPath?: string
  debug?: boolean
  distImportMapPath?: string
  featureFlags?: FeatureFlags
  importMapPaths?: (string | undefined)[]
  onAfterDownload?: OnAfterDownloadHook
  onBeforeDownload?: OnBeforeDownloadHook
  systemLogger?: LogFunction
  internalSrcFolder?: string
}

const bundle = async (
  sourceDirectories: string[],
  distDirectory: string,
  tomlDeclarations: Declaration[] = [],
  {
    basePath: inputBasePath,
    cacheDirectory,
    configPath,
    debug,
    distImportMapPath,
    featureFlags: inputFeatureFlags,
    importMapPaths = [],
    onAfterDownload,
    onBeforeDownload,
    systemLogger,
    internalSrcFolder,
  }: BundleOptions = {},
) => {
  const logger = getLogger(systemLogger, debug)
  const featureFlags = getFlags(inputFeatureFlags)
  const options: DenoOptions = {
    debug,
    cacheDirectory,
    logger,
    onAfterDownload,
    onBeforeDownload,
  }

  if (cacheDirectory !== undefined) {
    options.denoDir = join(cacheDirectory, 'deno_dir')
  }

  const deno = new DenoBridge(options)
  const basePath = getBasePath(sourceDirectories, inputBasePath)

  await ensureLatestTypes(deno, logger)

  // The name of the bundle will be the hash of its contents, which we can't
  // compute until we run the bundle process. For now, we'll use a random ID
  // to create the bundle artifacts and rename them later.
  const buildID = uuidv4()

  // Loading any configuration options from the deploy configuration API, if it
  // exists.
  const deployConfig = await loadDeployConfig(configPath, logger)

  // Layers are marked as externals in the ESZIP, so that those specifiers are
  // not actually included in the bundle.
  const externals = deployConfig.layers.map((layer) => layer.name)

  const userSourceDirectories = sourceDirectories.filter((dir) => dir !== internalSrcFolder)

  const importMap = new ImportMap()

  await importMap.addFiles([deployConfig?.importMap, ...importMapPaths], logger)

  const userFunctions = userSourceDirectories.length === 0 ? [] : await findFunctions(userSourceDirectories)
  const internalFunctions = internalSrcFolder ? await findFunctions([internalSrcFolder]) : []
  const functions = [...internalFunctions, ...userFunctions]

  const functionBundle = await bundleESZIP({
    basePath,
    buildID,
    debug,
    deno,
    distDirectory,
    externals,
    functions,
    featureFlags,
    importMap,
  })

  // The final file name of the bundles contains a SHA256 hash of the contents,
  // which we can only compute now that the files have been generated. So let's
  // rename the bundles to their permanent names.
  await createFinalBundles([functionBundle], distDirectory, buildID)

  // Creating a hash of function names to configuration objects.
  const internalFunctionsWithConfig: Record<string, FunctionConfig> = {}
  for (const func of internalFunctions) {
    internalFunctionsWithConfig[func.name] = await getFunctionConfig(func, importMap, deno, logger, featureFlags)
  }

  const userFunctionsWithConfig: Record<string, FunctionConfig> = {}
  for (const func of userFunctions) {
    userFunctionsWithConfig[func.name] = await getFunctionConfig(func, importMap, deno, logger, featureFlags)
  }

  // Creating a final declarations array by combining the TOML file with the
  // deploy configuration API and the in-source configuration.
  const declarationsFromConfig = mergeDeclarations(
    tomlDeclarations,
    userFunctionsWithConfig,
    internalFunctionsWithConfig,
    deployConfig.declarations,
  )

  // If any declarations are autogenerated and are missing the generator field
  // add a default string.
  const declarations = internalSrcFolder
    ? declarationsFromConfig.map((declaration) => addGeneratorFieldIfMissing(declaration, functions, internalSrcFolder))
    : declarationsFromConfig

  const manifest = await writeManifest({
    bundles: [functionBundle],
    declarations,
    distDirectory,
    featureFlags,
    functions,
    userFunctionConfig: userFunctionsWithConfig,
    internalFunctionConfig: internalFunctionsWithConfig,
    importMap: importMapSpecifier,
    layers: deployConfig.layers,
  })

  if (distImportMapPath) {
    await importMap.writeToFile(distImportMapPath)
  }

  return { functions, manifest }
}

const createFinalBundles = async (bundles: Bundle[], distDirectory: string, buildID: string) => {
  const renamingOps = bundles.map(async ({ extension, hash }) => {
    const tempBundlePath = join(distDirectory, `${buildID}${extension}`)
    const finalBundlePath = join(distDirectory, `${hash}${extension}`)

    await fs.rename(tempBundlePath, finalBundlePath)
  })

  await Promise.all(renamingOps)
}

const getBasePath = (sourceDirectories: string[], inputBasePath?: string) => {
  // If there's a specific base path supplied, that takes precedence.
  if (inputBasePath !== undefined) {
    return inputBasePath
  }

  // `common-path-prefix` returns an empty string when called with a single
  // path, so we check for that case and return the path itself instead.
  if (sourceDirectories.length === 1) {
    return sourceDirectories[0]
  }

  return commonPathPrefix(sourceDirectories)
}

export const addGeneratorFieldIfMissing = (
  declaration: Declaration,
  functions: EdgeFunction[],
  internalFunctionsPath?: string,
) => {
  const fullFuncPath = functions?.find((func) => func.name === declaration.function)?.path

  // If function path is in the internalFunctionsPath, we assume it is autogenerated.
  const isInternal = Boolean(internalFunctionsPath && fullFuncPath && isPathInside(fullFuncPath, internalFunctionsPath))

  const generatorFallback = isInternal ? 'internalFunc' : undefined
  return { ...declaration, generator: declaration.generator || generatorFallback }
}

export { bundle }
export type { BundleOptions }
