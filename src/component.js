import { ComponentReference } from './component-reference.js';

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{[key: string]: Scalar}} ScalarObject */
/** @typedef {Scalar|ScalarObject|Component|ComponentReference} VarValue */
/** @typedef {{[key: string]: (VarValue|Array<VarValue>)}} ComponentVars */
/** @typedef {{new(vars: ComponentVars): Component, componentName: string}} ComponentConstructor */

/**
 * Base class for all FuseWire components.
 *
 * Framework-managed properties (set by the engine, read-only for developers):
 *   - _componentId   ComponentId object (name, id, version, code)
 *   - _registryEntry  Shared entry object with container/parent (managed by InstanceRegistry)
 *   - _console        Pre-built console wrapper (creates LogMessage with component context)
 *   - _reactor        Reactor reference (enables react(), console, etc.)
 *   - _lifecycleActive  Name of the active lifecycle hook or null (guards against react() during hooks)
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
     * Create a new Component instance
     * @param {ComponentVars} vars - Component variables/data
     */
    constructor(vars = {}) {
        this.componentVars = vars;
        this._componentId = null; // Set by framework (ComponentId)
        this._registryEntry = null; // Set by framework ({ container, parent })
        this._console = null; // Set by framework (pre-built console wrapper)
        this._reactor = null; // Set by framework (Reactor)
        this._lifecycleActive = null; // Set by framework during lifecycle hooks (string name or null)
    }

    /**
     * Component name — the class/template name (e.g. "Counter", "Table/Person").
     * @returns {string} The component name
     */
    get componentName() {
        return this._componentId.name;
    }

    /**
     * Component instance id — unique within the component name (e.g. "main", "1234").
     * @returns {string} The instance identifier
     */
    get componentId() {
        return this._componentId.id;
    }

    /**
     * Template version hash — set by the framework after each render.
     * @returns {string} The template version
     */
    get componentVersion() {
        return this._componentId.version;
    }

    /**
     * Component code — full unique reference (e.g. "Counter#main").
     * @returns {string} The component code
     */
    get componentCode() {
        return this._componentId.code;
    }

    /**
     * DOM container element where this component renders.
     * Managed by the InstanceRegistry — may change when DOM morphing
     * replaces elements or when the component moves.
     * @returns {HTMLElement} The container element
     */
    get componentContainer() {
        return this._registryEntry.container;
    }

    /**
     * Parent component instance.
     * Managed by the InstanceRegistry — may change if the component
     * is moved to a different parent.
     * @returns {Component|null} The parent component or null if root
     */
    get componentParent() {
        return this._registryEntry.parent;
    }

    /**
     * Alias for componentVars
     * @returns {ComponentVars} Component variables/data
     */
    get vars() {
        return this.componentVars;
    }

    /**
     * Hydrate hook - called after vars are set/updated, before render
     * Override in subclasses for initialization logic
     * @async
     * @returns {Promise<void>}
     */
    async hydrate() {
        // Override in subclasses
    }

    /**
     * Update component vars via shallow merge (Object.assign semantics).
     *
     * Works the same way on both Component and ComponentReference — call
     * `ref.update({ badge: '2' })` regardless of whether the child has been
     * created yet. Before creation the ComponentReference merges vars locally;
     * after creation the framework replaces the reference in the parent's vars
     * with the real Component, so the same call reaches here.
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
        Object.assign(this.componentVars, newVars);
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
        return this._console;
    }

    /**
     * Trigger re-render of this component.
     * Ignored during lifecycle hooks (hydrate, update, afterRender) because
     * the framework already renders the component after those hooks return.
     * @param {string} mode - Render mode ('CSR' for client-side only)
     */
    react(mode = 'CSR') {
        if (this._lifecycleActive) {
            this._console.warn(
                `react() called during ${this._lifecycleActive}() — ignored (the framework renders automatically after lifecycle hooks)`,
            );
            return;
        }
        if (!this._reactor) {
            throw new Error('Component: Cannot react - reactor not attached');
        }
        this._reactor.react(this._componentId, mode);
    }
}
