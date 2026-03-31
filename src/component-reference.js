import { ComponentId } from './component-id.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */

/**
 * ComponentReference - A lightweight declaration of a child component.
 *
 * This is NOT a Component instance. It carries only the data needed for
 * the InstanceRegistry to create the real Component: name, id, vars, and
 * an optional version for cache validation.
 *
 * Developers create references via Component.createChild() inside component
 * code. The InstanceRegistry recognises these in vars and auto-mounts the
 * real Component at render time.
 *
 * After the real Component is created, the framework replaces this reference
 * in the parent's vars with the Component instance. From that point on, the
 * parent interacts directly with the Component. This reference should not be
 * used after replacement — doing so is a bug in the calling code.
 *
 * @example
 * // Inside a component method:
 * this.sidebar = this.createChild('Sidebar', 'main', { collapsed: false });
 * this.react();
 */
export class ComponentReference {
    /**
     * Create a new ComponentReference
     * @param {string} componentName - Component name for template/class resolution
     * @param {string} id - Instance identifier (may be empty)
     * @param {ComponentVars} vars - Initial variables for the component
     * @param {string|null} version - Template version hash, or null for latest
     */
    constructor(componentName, id = '', vars = {}, version = null) {
        if (!componentName || typeof componentName !== 'string') {
            throw new Error('ComponentReference: componentName must be a non-empty string');
        }
        this.componentName = componentName;
        this.id = id;
        this.vars = vars;
        this.version = version;
        this._replaced = false;
        this._bufferedEvents = [];
    }

    /**
     * Build a ComponentId from this reference
     * @returns {ComponentId} The corresponding ComponentId
     */
    toComponentId() {
        return new ComponentId(this.componentName, this.id);
    }

    /**
     * Update vars via shallow merge (Object.assign semantics).
     *
     * This method exists so that parent code can call `ref.update({ key: value })`
     * regardless of whether the child Component has been created yet. Before
     * creation, this merges into the reference's vars — those vars will be used
     * when the Component is eventually instantiated. After creation, the framework
     * replaces this reference with the real Component in the parent's vars, so
     * subsequent update() calls reach Component.update() instead.
     *
     * If this reference has already been replaced by the real Component, calling
     * update() is a bug — the caller is holding a stale reference.
     *
     * @param {ComponentVars} newVars - Vars to merge into the reference
     */
    update(newVars) {
        if (this._replaced) {
            throw new Error(
                `ComponentReference: update() called on replaced reference "${this.toComponentId().code}". ` +
                    'Use the Component instance from vars instead.',
            );
        }
        Object.assign(this.vars, newVars);
    }

    /**
     * Buffer an event subscription to be replayed on the real Component once mounted.
     *
     * Returns an unsubscribe function that works both before and after the real
     * instance is created: before creation it marks the entry as removed so replay
     * skips it; after creation it delegates to the real Component's unsubscribe.
     *
     * @param {string} eventName - Event name to listen for
     * @param {function(...*): (void|false)} handler - Callback invoked when the event fires
     * @returns {function(): void} Unsubscribe function
     */
    on(eventName, handler) {
        if (this._replaced) {
            throw new Error(
                `ComponentReference: on() called on replaced reference "${this.toComponentId().code}". ` +
                    'Use the Component instance from vars instead.',
            );
        }
        const entry = { eventName, handler, removed: false, realUnsub: null };
        this._bufferedEvents.push(entry);
        return () => {
            if (entry.realUnsub) {
                entry.realUnsub();
            } else {
                entry.removed = true;
            }
        };
    }

    /**
     * Replay buffered event subscriptions on the real Component instance.
     * Called by the InstanceRegistry after the real Component is created and
     * the reference is replaced in the parent's vars.
     * @param {import('./component.js').Component} component - The real Component instance
     */
    _replayBufferedEvents(component) {
        for (const entry of this._bufferedEvents) {
            if (!entry.removed) {
                entry.realUnsub = component.on(entry.eventName, entry.handler);
            }
        }
        this._bufferedEvents = [];
    }
}
