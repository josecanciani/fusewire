import { CONSOLE, EVENTS } from './symbols.js';

/**
 * Functional pub/sub utilities for components.
 * State is stored purely as a Map on the component instance via the EVENTS symbol.
 */

/**
 * Subscribe to an event on a component.
 * @param {import('./component.js').Component|import('./component.js').Child|import('./reactor.js').Reactor} component - The component to listen to
 * @param {string} eventName - Event name to listen for, or '*' for all events
 * @param {function(...*): (void|false)} handler - Callback invoked when the event fires
 * @returns {function(): void} Unsubscribe function
 */
export function onEvent(component, eventName, handler) {
    /**
     * Handlers map
     * @type {Map<string, Set<function(...*): (void|false)>>}
     */
    let handlers = /** @type {Record<symbol, *>} */ (component)[EVENTS];
    if (!handlers) {
        handlers = new Map();
        /** @type {Record<symbol, *>} */ (component)[EVENTS] = handlers;
    }
    if (!handlers.has(eventName)) handlers.set(eventName, new Set());
    /** @type {Set<function(...*): (void|false)>} Event handler set */ (
        handlers.get(eventName)
    ).add(handler);
    return () => {
        const handlerSet = handlers.get(eventName);
        if (handlerSet) handlerSet.delete(handler);
    };
}

/**
 * Emit an event on a component.
 * @param {import('./component.js').Component|import('./component.js').Child|import('./reactor.js').Reactor} component - The component listening the event
 * @param {string} eventName - Event name to emit
 * @param {...*} args - Arguments forwarded to each handler
 * @returns {Array.<unknown>} Errors thrown by handlers, in call order
 */
export function emitEvent(component, eventName, ...args) {
    return _emit(component, eventName, args, false).errors;
}

/**
 * Emit a broadcast event, stopping if a handler returns false.
 * @param {import('./component.js').Component|import('./component.js').Child|import('./reactor.js').Reactor} component - The component emitting
 * @param {string} eventName - Event name to emit
 * @param {...*} args - Arguments forwarded to each handler
 * @returns {{errors: Array.<unknown>, stopped: boolean}} Errors and whether propagation was stopped
 */
export function emitBroadcast(component, eventName, ...args) {
    return _emit(component, eventName, args, true);
}

/**
 * Internal unified emit logic.
 * @param {import('./component.js').Component|import('./component.js').Child|import('./reactor.js').Reactor} component - The component emitting
 * @param {string} eventName - Event name
 * @param {Array.<*>} args - Arguments to pass
 * @param {boolean} stopOnFalse - Whether to stop on false
 * @returns {{errors: Array.<unknown>, stopped: boolean}} Emit result
 */
function _emit(component, eventName, args, stopOnFalse) {
    /**
     * List of errors
     * @type {Array.<unknown>}
     */
    const errors = [];
    let stopped = false;

    /**
     * Handlers map
     * @type {Map<string, Set<function(...*): (void|false)>>}
     */
    const handlersMap = /** @type {Record<symbol, *>} */ (component)[EVENTS];
    if (!handlersMap) return { errors, stopped };

    const handlers = handlersMap.get(eventName);
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

    const wildcards = handlersMap.get('*');
    if (wildcards) {
        for (const handler of wildcards) {
            try {
                handler(eventName, ...args);
            } catch (err) {
                errors.push(err);
            }
        }
    }

    if (errors.length > 0 && /** @type {Record<symbol, *>} */ (component)[CONSOLE]) {
        for (const err of errors) {
            /** @type {import('./reactor.js').ConsoleLike} */ (
                /** @type {Record<symbol, *>} */ (component)[CONSOLE]
            ).error(
                `emit('${eventName}') listener threw: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    return { errors, stopped };
}

/**
 * Remove all registered handlers for a component.
 * @param {import('./component.js').Component|import('./component.js').Child|import('./reactor.js').Reactor} component - The component to clear
 */
export function clearEvents(component) {
    if (/** @type {Record<symbol, *>} */ (component)[EVENTS]) {
        /**
         * Handlers map
         * @type {Map<string, Set<function(...*): (void|false)>>}
         */
        const handlers = /** @type {Record<symbol, *>} */ (component)[EVENTS];
        handlers.clear();
    }
}
