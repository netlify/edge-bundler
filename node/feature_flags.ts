const defaultFlags: Record<string, boolean> = {
  edge_functions_cache_deno_dir: false,
  edge_functions_produce_eszip: false,
  edge_functions_use_global_deno: false,
}

type FeatureFlag = keyof typeof defaultFlags
type FeatureFlags = Record<FeatureFlag, boolean>

const getFlags = (input: Record<string, boolean> = {}, flags = defaultFlags): Record<FeatureFlag, string> =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )

export { defaultFlags, getFlags }
export type { FeatureFlag, FeatureFlags }
