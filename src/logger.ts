type LogFunction = (...args: unknown[]) => void

const noopLogger: LogFunction = () => {
  // no-op
}

interface Logger {
  system: LogFunction
  user: LogFunction
}

const getDefaultLogger = (): Logger => ({
  system: noopLogger,
  user: console.log,
})

const getLogger = (systemLogger?: LogFunction, debug = false): Logger => {
  // If there is a system logger configured, we'll use that. If there isn't,
  // we'll pipe system logs to stdout if `debug` is enabled and swallow them
  // otherwise.
  const system = systemLogger ?? (debug ? console.log : noopLogger)

  return {
    system,
    user: console.log,
  }
}

export { getDefaultLogger, getLogger }
export type { LogFunction, Logger }
