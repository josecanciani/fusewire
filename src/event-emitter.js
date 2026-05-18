import { CONSOLE } from './symbols.js';

/**
 * Lightweight event emitter used as a per-component pub/sub service.
 *
 * Supports wildcard subscriptions: `on('*', handler)` receives every event
 * with `(eventName, ...args)`. Wildcard handlers are observers — they cannot
 * stop broadcast propagation.
 *
 * The InstanceRegistry calls `clear()` after the component's destroy hook
 * to release all handler references.
 */
export class EventEmitter {
    /**
     * Create a new EventEmitter.
     * @param {import('./component.js').Component|import('./component.js').Child|null} component - The owner component (for logging)
     */
    constructor(component = null) {
        this._component = component;
        /**
         * Map of event names to a set of handler functions.
         * @type {Map<string, Set<function(...*): (void|false)>>}
         */
        this._handlers = new Map();
    }

    /**
     * Subscribe to an event.
     * Pass `'*'` as eventName to receive every event — the handler is called
     * with `(eventName, ...originalArgs)` for each emission.
     * Returns an unsubscribe function; call it to remove this handler early.
     * @param {string} eventName - Event name to listen for, or `'*'` for all events
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
     * @returns {Array.<unknown>} Errors thrown by handlers, in call order
     */
    emit(eventName, ...args) {
        return this._emit(eventName, args, false).errors;
    }

    /**
     * Emit a broadcast event, calling all registered handlers with the given arguments.
     * Like emit(), each handler is called even if a previous one threw — errors are collected.
     * Additionally tracks whether any handler returned false to signal that propagation
     * should stop for this component's subtree.
     * @param {string} eventName - Event name to emit
     * @param {...*} args - Arguments forwarded to each handler
     * @returns {{errors: Array.<unknown>, stopped: boolean}} Errors and whether propagation was stopped
     */
    emitBroadcast(eventName, ...args) {
        return this._emit(eventName, args, true);
    }

    /**
     * Internal unified emit logic.
     * @private
     * @param {string} eventName - Event name to emit
     * @param {Array.<*>} args - Arguments forwarded to each handler
     * @param {boolean} stopOnFalse - Whether to stop propagation if a handler returns false
     * @returns {{errors: Array.<unknown>, stopped: boolean}} Errors and whether propagation was stopped
     */
    _emit(eventName, args, stopOnFalse) {
        const errors = [];
        let stopped = false;
        const handlers = this._handlers.get(eventName);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    const result = handler(...args);
                    if (stopOnFalse && result === false) stopped = true;
                } catch (err) {
                    errors.push(err);
                }
            }
        }
        // Wildcard handlers receive (eventName, ...args)
        const wildcards = this._handlers.get('*');
        if (wildcards) {
            for (const handler of wildcards) {
                try {
                    handler(eventName, ...args);
                } catch (err) {
                    errors.push(err);
                }
            }
        }

        if (errors.length > 0 && this._component && this._component[CONSOLE]) {
            for (const err of errors) {
                /** @type {import('./reactor.js').ConsoleLike} */ (this._component[CONSOLE]).error(
                    `emit('${eventName}') listener threw: ${err instanceof Error ? err.message : String(err)}`,
                );
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
