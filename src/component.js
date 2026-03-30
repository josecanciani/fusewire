import { ComponentReference } from './component-reference.js';
import { EventEmitter } from './event-emitter.js';
import {
    COMPONENT_ID,
    REGISTRY_ENTRY,
    CONSOLE,
    REACTOR,
    LIFECYCLE_ACTIVE,
    EVENTS,
} from './symbols.js';

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{[key: string]: Scalar}} ScalarObject */
/** @typedef {Scalar|ScalarObject|Component|ComponentReference} VarValue */
/** @typedef {{[key: string]: (VarValue|Array<VarValue>)}} ComponentVars */
/** @typedef {{new(): Component, componentName: string}} ComponentConstructor */

/**
 * Base class for all FuseWire components.
 *
 * Component vars are declared as public class fields on subclasses:
 *
 *   class Counter extends Component {
 *       /&#42;&#42; @type {number} &#42;/
 *       count = 0;
 *   }
 *
 * Every own enumerable string-keyed property is a component var. The template
 * engine collects these automatically for rendering via Object.keys().
 * Access vars directly: `this.count`, not through an accessor.
 *
 * Framework-managed state is stored under Symbol keys (see symbols.js) so it
 * never appears in Object.keys() and cannot collide with component vars.
 */
export class Component {
    /**
     * Migrate vars when template version changes
     * Override in subclasses to handle version migrations
     * @static
     * @param {ComponentVars} vars - Stored vars from previous template version
     * @returns {ComponentVars} Migrated vars
     */
    static migrateVars(vars) {
        // Default: no migration, return as-is
        return vars;
    }

    /**
     * Component name — the class/template name (e.g. "Counter", "Table/Person").
     * @returns {string} The component name
     */
    get componentName() {
        return this[COMPONENT_ID].name;
    }

    /**
     * Component instance id — unique within the component name (e.g. "main", "1234").
     * @returns {string} The instance identifier
     */
    get componentId() {
        return this[COMPONENT_ID].id;
    }

    /**
     * Template version hash — set by the framework after each render.
     * @returns {string} The template version
     */
    get componentVersion() {
        return this[COMPONENT_ID].version;
    }

    /**
     * Component code — full unique reference (e.g. "Counter#main").
     * @returns {string} The component code
     */
    get componentCode() {
        return this[COMPONENT_ID].code;
    }

    /**
     * DOM container element where this component renders.
     * Managed by the InstanceRegistry — may change when DOM morphing
     * replaces elements or when the component moves.
     * @returns {HTMLElement} The container element
     */
    get componentContainer() {
        return this[REGISTRY_ENTRY].container;
    }

    /**
     * Parent component instance.
     * Managed by the InstanceRegistry — may change if the component
     * is moved to a different parent.
     * @returns {Component|null} The parent component or null if root
     */
    get componentParent() {
        return this[REGISTRY_ENTRY].parent;
    }

    /**
     * Init hook - called after vars are set and framework is wired, before first render.
     * Override in subclasses for initialization logic.
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        // Override in subclasses
    }

    /**
     * Update component vars via shallow merge (Object.assign semantics).
     *
     * Merges newVars directly onto the instance's own properties — the same
     * properties declared as class fields. Works the same way on both
     * Component and ComponentReference — call `ref.update({ badge: '2' })`
     * regardless of whether the child has been created yet.
     *
     * The server-side flow (InstanceRegistry) calls `update(newVars, false)`
     * because it handles rendering itself. Developer code should use the
     * default `react = true` so the component re-renders automatically.
     *
     * Subclasses can override to add custom logic (e.g. validation or
     * derived state), and must call `super.update(newVars, react)` to
     * apply the merge and trigger re-render.
     *
     * @param {ComponentVars} newVars - Vars to merge into the component
     * @param {boolean} react - Whether to trigger a re-render (default true)
     */
    update(newVars, react = true) {
        Object.assign(this, newVars);
        if (react) this.react();
    }

    /**
     * Destroy hook - called when component instance is removed
     */
    destroy() {
        // Override in subclasses
    }

    /**
     * After render hook - called synchronously after the DOM has been updated.
     * Called on every render (initial and re-renders via react()).
     * Must be synchronous to avoid race conditions with subsequent renders.
     */
    afterRender() {
        // Override in subclasses
    }

    /**
     * Create a lightweight reference to a child component.
     * The InstanceRegistry will create the real Component when it encounters
     * this reference in vars during rendering.
     * @param {string} name - Component name (e.g., 'Counter', 'Basics/Counter')
     * @param {string|ComponentVars} idOrVars - Instance id, or vars if id is omitted
     * @param {ComponentVars} [maybeVars] - Vars when id is provided as second argument
     * @returns {ComponentReference} A reference the framework will resolve at render time
     */
    createChild(name, idOrVars, maybeVars) {
        let id;
        let vars;
        if (typeof idOrVars === 'string') {
            id = idOrVars;
            vars = maybeVars || {};
        } else {
            id = '';
            vars = idOrVars || {};
        }
        return new ComponentReference(name, id, vars);
    }

    /**
     * Get the console for this component.
     * Returns a pre-built wrapper that creates LogMessage objects with
     * component context, then forwards to the Reactor-level console
     * multiplexer. Supports rest parameters: this.console.log(msg, ...args).
     * @returns {import('./reactor.js').ConsoleLike} Console-like object with log, warn, error methods
     */
    get console() {
        return this[CONSOLE];
    }

    /**
     * Subscribe to an event emitted by this component.
     * Returns an unsubscribe function. All subscriptions are cleared automatically
     * when the component is destroyed by the InstanceRegistry.
     * @param {string} eventName - Event name to listen for
     * @param {function(...*): void} handler - Callback invoked when the event fires
     * @returns {function(): void} Unsubscribe function — call it to remove this handler early
     */
    on(eventName, handler) {
        if (!this[EVENTS]) this[EVENTS] = new EventEmitter();
        return this[EVENTS].on(eventName, handler);
    }

    /**
     * Emit an event, calling all registered handlers with the given arguments.
     * Intended for use within the component's own methods (subclass-internal).
     * Warns if called during a lifecycle hook, since listeners may not be registered yet.
     * All handlers are called even if one throws — errors are logged via the component console.
     * @param {string} eventName - Event name to emit
     * @param {...*} args - Arguments forwarded to each handler
     */
    emit(eventName, ...args) {
        if (this[LIFECYCLE_ACTIVE]) {
            this[CONSOLE].warn(
                `emit('${eventName}') called during ${this[LIFECYCLE_ACTIVE]}() — listeners may not be registered yet`,
            );
        }
        if (!this[EVENTS]) return;
        for (const err of this[EVENTS].emit(eventName, ...args)) {
            this[CONSOLE].error(`emit('${eventName}') listener threw: ${err.message}`);
        }
    }

    /**
     * Trigger re-render of this component.
     * Ignored during lifecycle hooks (init, update, afterRender) because
     * the framework already renders the component after those hooks return.
     * @param {string} mode - Render mode ('CSR' for client-side only)
     */
    react(mode = 'CSR') {
        if (this[LIFECYCLE_ACTIVE]) {
            this[CONSOLE].warn(
                `react() called during ${this[LIFECYCLE_ACTIVE]}() — ignored (the framework renders automatically after lifecycle hooks)`,
            );
            return;
        }
        if (!this[REACTOR]) {
            throw new Error('Component: Cannot react - reactor not attached');
        }
        this[REACTOR].react(this[COMPONENT_ID], mode);
    }
}
