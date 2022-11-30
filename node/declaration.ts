import { FunctionConfig } from './config.js'
import type { DeployConfig } from './deploy_config.js'
import { Logger } from './logger.js'

interface BaseDeclaration {
  cache?: string
  function: string
  name?: string
}

type DeclarationWithPath = BaseDeclaration & {
  path: string
}

type DeclarationWithPattern = BaseDeclaration & {
  pattern: string
}

type Declaration = DeclarationWithPath | DeclarationWithPattern

export const getDeclarationsFromConfig = (
  tomlDeclarations: Declaration[],
  functionsConfig: Record<string, FunctionConfig>,
  deployConfig: DeployConfig,
  log: Logger,
) => {
  const declarations: Declaration[] = []
  const functionsVisited: Set<string> = new Set()

  // We start by iterating over all the declarations in the TOML file and in
  // the deploy configuration file. For any declaration for which we also have
  // a function configuration object, we replace the path because that object
  // takes precedence.
  for (const declaration of [...tomlDeclarations, ...deployConfig.declarations]) {
    const config = functionsConfig[declaration.function] ?? {}

    // If no config is found, add the declaration as is
    if (Object.keys(config).length === 0) {
      declarations.push(declaration)
    }

    // log if the path property is not an array
    if (config.path && !Array.isArray(config.path)) {
      log.user(
        `Can't use in source config path property: ${config.path}. Function configuration path property must be an array.`,
      )
    }

    // If we have path specified create a declaration for each path
    if (Array.isArray(config.path) && config.path.length !== 0) {
      config.path.forEach((path) => {
        declarations.push({ ...declaration, ...config, path })
      })
      // If only cache was specified, add it to the declaration
    } else if (config.cache) {
      declarations.push({ ...declaration, cache: config.cache })
    }

    functionsVisited.add(declaration.function)
  }

  // Finally, we must create declarations for functions that are not declared
  // in the TOML at all.
  for (const name in functionsConfig) {
    const { path, ...config } = functionsConfig[name]

    // log if the path property is not an array
    if (path && !Array.isArray(path)) {
      log.user(
        `Can't use in source config path property: ${path}. Function configuration path property must be an array.`,
      )
    }

    // If we have path specified create a declaration for each path
    if (!functionsVisited.has(name) && Array.isArray(path) && path.length !== 0) {
      path.forEach((singlePath) => {
        declarations.push({ ...config, function: name, path: singlePath })
      })
    }
  }

  return declarations
}

export { Declaration, DeclarationWithPath, DeclarationWithPattern }
