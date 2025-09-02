export const createLogger = function (name: string, verbose: number = 1) {
    const logs: any[] = [];
    const errors: any[] = [];
    const trace = (...args: any[]) => {
        if (verbose >= 3) {
            console.trace(`[${name}]`, ...args);
        }
    }
    const log = (...args: any[]) => {
        logs.push(args);
        if (verbose >= 2) {
            console.log(`[${name}]`, ...args);
        }
    }
    const error = (...args: any[]) => {
        errors.push(args);
        if (verbose >= 1) {
            console.error(`[${name}]`, ...args);
        }
    }
    return {
        trace,
        log,
        error
    }
}
