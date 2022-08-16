import retry from 'async-retry'

// connectionRetrier wraps an async callback function in a retry mechanism
// the retry mechanism checks any caught errors for common network error
// strings, and retries the callback before giving up and throwing the error
const connectionRetrier = async (func: () => Promise<void>) => {
  await retry(
    async (bail) => {
      try {
        await func()
      } catch (error: unknown) {
        if (error instanceof Error && isConnectionError(error)) {
          bail(error)
          return
        }

        // Don't bother retrying, just throw the error
        throw error
      }
    },
    { retries: 3 },
  )
}

// TODO: this is potentially flaky, kinda gross, and doesn't cover all
// of the potential error cases applicable to connection errors.
// We need to improve this approach.
// But ultimately, this information comes from a sub-process.
const isConnectionError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('connection error') || error.message.includes('error trying to connect'))

export { connectionRetrier }
