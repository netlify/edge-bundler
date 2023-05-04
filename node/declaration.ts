import regexpAST from 'regexp-tree'

import { FunctionConfig, Path } from './config.js'
import { FeatureFlags } from './feature_flags.js'

interface BaseDeclaration {
  cache?: string
  function: string
  // todo: remove these two after a while and only support in-source config for non-route related configs
  name?: string
  generator?: string
}

type DeclarationWithPath = BaseDeclaration & {
  path: Path
  excludedPath?: Path
}

type DeclarationWithPattern = BaseDeclaration & {
  pattern: string
  excludedPattern?: string
}

export type Declaration = DeclarationWithPath | DeclarationWithPattern

export const mergeDeclarations = (
  tomlDeclarations: Declaration[],
  userFunctionsConfig: Record<string, FunctionConfig>,
  internalFunctionsConfig: Record<string, FunctionConfig>,
  deployConfigDeclarations: Declaration[],
  featureFlags: FeatureFlags = {},
  // eslint-disable-next-line max-params
) => {
  const functionsVisited: Set<string> = new Set()

  let declarations: Declaration[] = getDeclarationsFromInput(
    deployConfigDeclarations,
    internalFunctionsConfig,
    functionsVisited,
  )

  // eslint-disable-next-line unicorn/prefer-ternary
  if (featureFlags.edge_functions_correct_order) {
    declarations = [
      // INTEGRATIONS
      // 1. Declarations from the integrations deploy config
      ...getDeclarationsFromInput(deployConfigDeclarations, internalFunctionsConfig, functionsVisited),
      // 2. Declarations from the integrations ISC
      ...createDeclarationsFromFunctionConfigs(internalFunctionsConfig, functionsVisited),

      // USER
      // 3. Declarations from the users toml config
      ...getDeclarationsFromInput(tomlDeclarations, userFunctionsConfig, functionsVisited),
      // 4. Declarations from the users ISC
      ...createDeclarationsFromFunctionConfigs(userFunctionsConfig, functionsVisited),
    ]
  } else {
    declarations = [
      ...getDeclarationsFromInput(tomlDeclarations, userFunctionsConfig, functionsVisited),
      ...getDeclarationsFromInput(deployConfigDeclarations, internalFunctionsConfig, functionsVisited),
      ...createDeclarationsFromFunctionConfigs(internalFunctionsConfig, functionsVisited),
      ...createDeclarationsFromFunctionConfigs(userFunctionsConfig, functionsVisited),
    ]
  }

  return declarations
}

const getDeclarationsFromInput = (
  inputDeclarations: Declaration[],
  functionConfigs: Record<string, FunctionConfig>,
  functionsVisited: Set<string>,
): Declaration[] => {
  const declarations: Declaration[] = []
  // For any declaration for which we also have a function configuration object,
  // we replace the path because that object takes precedence.
  for (const declaration of inputDeclarations) {
    const config = functionConfigs[declaration.function]

    if (!config) {
      // If no config is found, add the declaration as is.
      declarations.push(declaration)
    } else if (config.path?.length) {
      // If we have a path specified as either a string or non-empty array,
      // create a declaration for each path.
      const paths = Array.isArray(config.path) ? config.path : [config.path]

      paths.forEach((path) => {
        declarations.push({ ...declaration, cache: config.cache, path })
      })
    } else {
      // With an in-source config without a path, add the config to the declaration.
      const { path, excludedPath, ...rest } = config

      declarations.push({ ...declaration, ...rest })
    }

    functionsVisited.add(declaration.function)
  }

  return declarations
}

const createDeclarationsFromFunctionConfigs = (
  functionConfigs: Record<string, FunctionConfig>,
  functionsVisited: Set<string>,
): Declaration[] => {
  const declarations: Declaration[] = []

  for (const name in functionConfigs) {
    const { cache, path } = functionConfigs[name]

    // If we have a path specified, create a declaration for each path.
    if (!functionsVisited.has(name) && path) {
      const paths = Array.isArray(path) ? path : [path]

      paths.forEach((singlePath) => {
        const declaration: Declaration = { function: name, path: singlePath }
        if (cache) {
          declaration.cache = cache
        }
        declarations.push(declaration)
      })
    }
  }

  return declarations
}

// Validates and normalizes a pattern so that it's a valid regular expression
// in Go, which is the engine used by our edge nodes.
export const parsePattern = (pattern: string) => {
  const regexp = new RegExp(pattern)
  const newRegexp = regexpAST.transform(regexp, {
    Assertion(path) {
      // Lookaheads are not supported. If we find one, throw an error.
      if (path.node.kind === 'Lookahead') {
        throw new Error('Regular expressions with lookaheads are not supported')
      }
    },

    Group(path) {
      // Named captured groups in JavaScript use a different syntax than in Go.
      // If we find one, convert it to an unnamed capture group, which is valid
      // in both engines.
      if ('name' in path.node && path.node.name !== undefined) {
        path.replace({
          ...path.node,
          name: undefined,
          nameRaw: undefined,
        })
      }
    },
  })

  // Strip leading and forward slashes.
  return newRegexp.toString().slice(1, -1)
}
