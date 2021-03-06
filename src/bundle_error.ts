interface BundleErrorOptions {
  format: string
}

const getCustomErrorInfo = (options: BundleErrorOptions) => ({
  location: {
    format: options.format,
    runtime: 'deno',
  },
  type: 'functionsBundling',
})

class BundleError extends Error {
  customErrorInfo: ReturnType<typeof getCustomErrorInfo>

  constructor(originalError: Error, options: BundleErrorOptions) {
    super(originalError.message)

    this.customErrorInfo = getCustomErrorInfo(options)
    this.name = 'BundleError'
    this.stack = originalError.stack

    // https://github.com/microsoft/TypeScript-wiki/blob/8a66ecaf77118de456f7cd9c56848a40fe29b9b4/Breaking-Changes.md#implicit-any-error-raised-for-un-annotated-callback-arguments-with-no-matching-overload-arguments
    Object.setPrototypeOf(this, BundleError.prototype)
  }
}

const wrapBundleError = (input: unknown, options: BundleErrorOptions) => {
  if (input instanceof Error) {
    return new BundleError(input, options)
  }

  return input
}

export { BundleError, wrapBundleError }
