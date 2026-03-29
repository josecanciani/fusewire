/**
 * Structured log message with component context.
 *
 * Created automatically by the component console wrapper — callers keep
 * using the standard console.log / warn / error interface. The native
 * console receives the toString() representation; attached consoles
 * (e.g. the Console Panel) can inspect the object for richer rendering.
 *
 * No object references are stored — only the ComponentId (which holds
 * only strings) and the message text.
 */
export class LogMessage {
    /**
     * Create a log message with context
     * @param {import('./component-id.js').ComponentId} componentId - Source component identity
     * @param {string} message - The log text
     */
    constructor(componentId, message) {
        this.componentId = componentId;
        this.message = message;
        this.timestamp = new Date();
    }

    /**
     * Format the timestamp as HH:MM:SS.mmm
     * @returns {string} Formatted time string
     */
    formatTime() {
        const h = String(this.timestamp.getHours()).padStart(2, '0');
        const m = String(this.timestamp.getMinutes()).padStart(2, '0');
        const s = String(this.timestamp.getSeconds()).padStart(2, '0');
        const ms = String(this.timestamp.getMilliseconds()).padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }

    /**
     * String representation for native console output
     * @returns {string} Formatted log line
     */
    toString() {
        return `[${this.formatTime()}] ${this.componentId.code}: ${this.message}`;
    }
}
