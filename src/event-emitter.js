/**
 * Lightweight event emitter used as a per-component pub/sub service.
 *
 * The InstanceRegistry calls `clear()` after the component's destroy hook
 * to release all handler references.
 */
export class EventEmitter {
    /**
     * Create a new EventEmitter.
     */
    constructor() {
        /** @type {Map<string, Set<function(...*): (void|false)>>} */
        this._handlers = new Map();
    }

    /**
     * Subscribe to an event.
     * Returns an unsubscribe function; call it to remove this handler early.
     * @param {string} eventName - Event name to listen for
     * @param {function(...*): (void|false)} handler - Callback invoked when the event fires
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
     * Emit a broadcast event, calling all registered handlers with the given arguments.
     * Like emit(), each handler is called even if a previous one threw — errors are collected.
     * Additionally tracks whether any handler returned false to signal that propagation
     * should stop for this component's subtree.
     * @param {string} eventName - Event name to emit
     * @param {...*} args - Arguments forwarded to each handler
     * @returns {{errors: Array.<Error>, stopped: boolean}} Errors and whether propagation was stopped
     */
    emitBroadcast(eventName, ...args) {
        const handlers = this._handlers.get(eventName);
        if (!handlers) return { errors: [], stopped: false };
        const errors = [];
        let stopped = false;
        for (const handler of handlers) {
            try {
                if (handler(...args) === false) stopped = true;
            } catch (err) {
                errors.push(err);
            }
        }
        return { errors, stopped };
    }

    /**
     * Remove all registered handlers.
     * Called by the InstanceRegistry after the component is destroyed.
     */
    clear() {
        this._handlers.clear();
    }
}
