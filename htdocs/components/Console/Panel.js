import { Component } from '/js/component.js';
import { LogMessage } from '/js/log-message.js';
import { REACTOR } from '/js/symbols.js';

/**
 * Console panel component — receives log messages from the reactor and displays them as a scrolling list.
 */
export class Panel extends Component {
    /**
     * Collection of rendered log lines.
     * @type {Array.<import('./Line.js').Line>}
     */
    logs = [];

    #lastKey = '';
    #lastCount = 0;
    #messageCount = 1;

    /**
     * Attach this console to the reactor and add the initial log entry
     */
    async init() {
        this[REACTOR].attachConsole(this);
        this.logs.push(
            this.createChild('Console/Line', '1', {
                level: 'log',
                message: 'Console ready',
                badge: 0,
                source: '',
                timestamp: '',
            }),
        );
    }

    /**
     * Detach this console from the reactor
     */
    destroy() {
        this[REACTOR].detachConsole(this);
    }

    /**
     * Log a message at the "log" level
     * @param {string|LogMessage} message - Message text or structured log message
     * @param {...*} args - Additional values to append to the message
     */
    log(message, ...args) {
        this.#addLog('log', message, ...args);
    }

    /**
     * Log a message at the "warn" level
     * @param {string|LogMessage} message - Message text or structured log message
     * @param {...*} args - Additional values to append to the message
     */
    warn(message, ...args) {
        this.#addLog('warn', message, ...args);
    }

    /**
     * Log a message at the "error" level
     * @param {string|LogMessage} message - Message text or structured log message
     * @param {...*} args - Additional values to append to the message
     */
    error(message, ...args) {
        this.#addLog('error', message, ...args);
    }

    /**
     * Append a new log entry or increment the badge on the last entry if it is a duplicate.
     * @param {string} level - Log level ('log', 'warn', or 'error')
     * @param {string|import('/js/log-message.js').LogMessage} message - Message text or structured log message
     * @param {...*} args - Additional values to append
     */
    #addLog(level, message, ...args) {
        this.#messageCount++;
        const isLogMessage = message instanceof LogMessage;
        const text = isLogMessage ? message.message : String(message);
        const source = isLogMessage ? message.componentId.code : '';
        const timestamp = isLogMessage ? message.formatTime() : '';

        // Stringify extra args immediately — no object references kept
        const argsText = args
            .map((a) => {
                if (a === null) return 'null';
                if (a === undefined) return 'undefined';
                if (typeof a === 'object') {
                    try {
                        return JSON.stringify(a);
                    } catch {
                        return String(a);
                    }
                }
                return String(a);
            })
            .join(' ');
        const fullMessage = argsText ? `${text} ${argsText}` : text;

        const key = level + ':' + source + ':' + fullMessage;
        if (this.#lastKey === key) {
            this.#lastCount++;
            this.logs.at(-1).update({ badge: this.#lastCount });
        } else {
            this.#lastKey = key;
            this.#lastCount = 1;
            this.logs.push(
                this.createChild('Console/Line', String(this.#messageCount), {
                    level,
                    message: fullMessage,
                    badge: 0,
                    source,
                    timestamp,
                }),
            );
            this.react();
        }
    }

    /**
     * Scroll the console to the latest log entry after each render
     */
    afterRender() {
        const container = this.querySelector('.console-panel-logs');
        if (container) {
            const scrollParent = container.closest('.overflow-auto');
            if (scrollParent) {
                scrollParent.scrollTop = scrollParent.scrollHeight;
            }
        }
    }

    /**
     * Clear all log entries from the console
     */
    clear() {
        this.#lastKey = '';
        this.#lastCount = 0;
        this.#messageCount = 0;
        this.logs = [];
        this.react();
    }
}
