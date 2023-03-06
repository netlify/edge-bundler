const defaultFlags = {
  edge_functions_fail_unsupported_regex: false,
  edge_functions_invalid_config_throw: false,
}

type FeatureFlag = keyof typeof defaultFlags
type FeatureFlags = Record<FeatureFlag | string, boolean>

const getFlags = (input: Record<string, boolean> = {}, flags = defaultFlags): FeatureFlags =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )

export { defaultFlags, getFlags }
export type { FeatureFlag, FeatureFlags }
