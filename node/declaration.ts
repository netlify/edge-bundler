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
    const { path } = functionsConfig[declaration.function] ?? {}

    if (path) {
      functionsVisited.add(declaration.function)

      declarations.push({ ...declaration, path })
    } else {
      declarations.push(declaration)
    }
  }

  // Finally, we must create declarations for functions that are not declared
  // in the TOML at all.
  for (const name in functionsConfig) {
    const { path, ...config } = functionsConfig[name]

    if (!functionsVisited.has(name) && path) {
      declarations.push({ ...config, function: name, path })
    }
  }

  return declarations
}

export { Declaration, DeclarationWithPath, DeclarationWithPattern }
