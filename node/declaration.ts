// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable max-depth */
import { FunctionConfig } from './config.js'
import type { DeployConfig } from './deploy_config.js'

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

    // If we have path specified create a declaration for each path
    if (config.path) {
      if (!Array.isArray(config.path)) config.path = [config.path]

      if (config.path.length !== 0)
        config.path.forEach((path) => {
          declarations.push({ ...declaration, ...config, path })
        })
      // if empty path array with cache set, add declaration with cache
      else if (config.cache) declarations.push({ ...declaration, cache: config.cache })
      // If only cache was specified, add it to the declaration
    } else if (config.cache) {
      declarations.push({ ...declaration, cache: config.cache })
    }

    functionsVisited.add(declaration.function)
  }

  // Finally, we must create declarations for functions that are not declared
  // in the TOML at all.
  for (const name in functionsConfig) {
    const { ...config } = functionsConfig[name]
    let { path } = functionsConfig[name]

    // If we have path specified create a declaration for each path
    if (!functionsVisited.has(name) && path) {
      if (!Array.isArray(path)) path = [path]

      if (path.length !== 0) {
        path.forEach((singlePath) => {
          declarations.push({ ...config, function: name, path: singlePath })
        })
      }
    }
  }

  return declarations
}

export { Declaration, DeclarationWithPath, DeclarationWithPattern }
