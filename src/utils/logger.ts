export const createLogger = function (name: string, verbose: number = 1) {
  const logs: unknown[] = [];
  const errors: unknown[] = [];
  const trace = (...args: unknown[]) => {
    if (verbose >= 3) {
      console.trace(`[${name}]`, ...args);
    }
  };
  const log = (...args: unknown[]) => {
    logs.push(args);
    if (verbose >= 2) {
      console.log(`[${name}]`, ...args);
    }
  };
  const error = (...args: unknown[]) => {
    errors.push(args);
    if (verbose >= 1) {
      console.error(`[${name}]`, ...args);
    }
  };
  return {
    trace,
    log,
    error,
  };
};
