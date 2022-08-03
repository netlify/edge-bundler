type LogFunction = (...args: unknown[]) => void

interface Logger {
  debug: LogFunction
  error: LogFunction
  log: LogFunction
}

const getLogger = (parentLogger: LogFunction = console.log): Logger => ({
  debug: (...args: unknown[]) => parentLogger({ level: 'debug' }, ...args),
  error: (...args: unknown[]) => parentLogger({ level: 'error' }, ...args),
  log: (...args: unknown[]) => parentLogger({ level: 'info' }, ...args),
})

export { getLogger }
export type { LogFunction, Logger }
