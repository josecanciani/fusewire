/**
 * Lightweight event emitter used as a per-component pub/sub service.
 *
 * The InstanceRegistry calls `clear()` after the component's destroy hook
 * to release all handler references.
 */
export class EventEmitter {
    constructor() {
        /** @type {Map<string, Set<function(...*): void>>} */
        this._handlers = new Map();
    }

    /**
     * Subscribe to an event.
     * Returns an unsubscribe function; call it to remove this handler early.
     * @param {string} eventName - Event name to listen for
     * @param {function(...*): void} handler - Callback invoked when the event fires
     * @returns {function(): void} Unsubscribe function
     */
    on(eventName, handler) {
        if (!this._handlers.has(eventName)) this._handlers.set(eventName, new Set());
        this._handlers.get(eventName).add(handler);
        return () => {
            const handlers = this._handlers.get(eventName);
            if (handlers) handlers.delete(handler);
        };
    }

    /**
     * Emit an event, calling all registered handlers with the given arguments.
     * Each handler is called even if a previous one threw — errors are collected
     * and returned so the caller can log them with component context.
     * @param {string} eventName - Event name to emit
     * @param {...*} args - Arguments forwarded to each handler
     * @returns {Array.<Error>} Errors thrown by handlers, in call order
     */
    emit(eventName, ...args) {
        const handlers = this._handlers.get(eventName);
        if (!handlers) return [];
        const errors = [];
        for (const handler of handlers) {
            try {
                handler(...args);
            } catch (err) {
                errors.push(err);
            }
        }
        return errors;
    }

    /**
     * Remove all registered handlers.
     * Called by the InstanceRegistry after the component is destroyed.
     */
    clear() {
        this._handlers.clear();
    }
}
