import type { Declaration } from '../declaration.js'

const addGeneratorIfMissing = (functions?: Declaration[]) =>
  functions?.map((func: Declaration) => ({ ...func, generator: func.generator || 'internalFunc' }))

export default addGeneratorIfMissing
