interface BaseDeclaration {
  function: string
  displayName?: string
}

type DeclarationWithPath = BaseDeclaration & {
  path: string
}

type DeclarationWithPattern = BaseDeclaration & {
  pattern: string
}

type Declaration = DeclarationWithPath | DeclarationWithPattern

export { Declaration, DeclarationWithPath, DeclarationWithPattern }
