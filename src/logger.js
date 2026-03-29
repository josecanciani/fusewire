/**
 * Logger - Pluggable logging system for FuseWire
 *
 * Allows logs to be directed to console, UI components, or both.
 */
export class Logger {
    constructor() {
        this._handlers = [];
        this._useConsole = true;
    }

    /**
     * Add a log handler
     * @param {Function} handler - Function that receives (level, message, ...args)
     */
    addHandler(handler) {
        this._handlers.push(handler);
    }

    /**
     * Remove a log handler
     * @param {Function} handler - Handler function to remove
     */
    removeHandler(handler) {
        const index = this._handlers.indexOf(handler);
        if (index > -1) {
            this._handlers.splice(index, 1);
        }
    }

    /**
     * Enable/disable console output
     * @param {boolean} enabled - Whether console output is enabled
     */
    setConsoleEnabled(enabled) {
        this._useConsole = enabled;
    }

    /**
     * Log a message
     * @param {string} level - Log level (debug, info, warn, error)
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    log(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            args,
        };

        // Send to console
        if (this._useConsole) {
            const consoleMethod = console[level] || console.log;
            consoleMethod(`[${level.toUpperCase()}]`, message, ...args);
        }

        // Send to custom handlers
        for (const handler of this._handlers) {
            handler(logEntry);
        }
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }
}

// Global default logger instance
export const logger = new Logger();
