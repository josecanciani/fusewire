import { ComponentReference } from './component-reference.js';
import { EventEmitter } from './event-emitter.js';
import {
    COMPONENT_ID,
    REGISTRY_ENTRY,
    CONSOLE,
    REACTOR,
    LIFECYCLE_ACTIVE,
    EVENTS,
    LIBRARIES,
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
     * Hydrate hook - called once after the first render.
     * The DOM exists, all children are mounted, and all libraries are loaded.
     * Use for one-time post-render setup: DOM queries, ResizeObserver, third-party widgets.
     * Must be synchronous.
     */
    hydrate() {
        // Override in subclasses
    }

    /**
     * Create a lightweight reference to a child component.
     * When called during init(), the framework starts the child's creation
     * pipeline immediately — loading the class and template, running init(),
     * and rendering into a detached container — all in parallel with other
     * children. The child is attached to the document when the parent renders
     * and discovers the mount point.
     * @param {string} name - Component name (e.g., 'Counter', 'Basics/Counter')
     * @param {string|ComponentVars} idOrVars - Instance id, or vars if id is omitted
     * @param {ComponentVars|import('./component-reference.js').ComponentReferenceOptions} [maybeVarsOrOptions] - Vars when id is provided, or options when id is omitted
     * @param {import('./component-reference.js').ComponentReferenceOptions} [maybeOptions] - Options when id and vars are provided
     * @returns {ComponentReference} A reference the framework will resolve at render time
     */
    createChild(name, idOrVars, maybeVarsOrOptions, maybeOptions) {
        let id;
        let vars;
        let options;
        if (typeof idOrVars === 'string') {
            id = idOrVars;
            vars = maybeVarsOrOptions || {};
            options = maybeOptions;
        } else {
            id = '';
            vars = idOrVars || {};
            options = maybeVarsOrOptions;
        }
        const ref = new ComponentReference(name, id, vars, null, options);
        if (this[REACTOR]) {
            this[REACTOR]._instanceRegistry.startEagerCreation(ref);
        }
        return ref;
    }

    /**
     * Create a lazy child component that loads in the background.
     * The parent renders immediately with a placeholder component. When the
     * real child is ready, the framework swaps the placeholder for the real
     * component and triggers a re-render of the parent.
     * @param {string} name - Component name (e.g., 'Analytics/HeavyChart')
     * @param {string|ComponentVars} idOrVars - Instance id, or vars if id is omitted
     * @param {ComponentVars|import('./component-reference.js').ComponentReferenceOptions} [maybeVarsOrOptions] - Vars when id is provided, or options when id is omitted
     * @param {import('./component-reference.js').ComponentReferenceOptions} [maybeOptions] - Options when id and vars are provided
     * @returns {ComponentReference} A reference the framework will resolve at render time
     */
    createLazyChild(name, idOrVars, maybeVarsOrOptions, maybeOptions) {
        let id;
        let vars;
        let options;
        if (typeof idOrVars === 'string') {
            id = idOrVars;
            vars = maybeVarsOrOptions || {};
            options = maybeOptions || {};
        } else {
            id = '';
            vars = idOrVars || {};
            options = maybeVarsOrOptions || {};
        }
        const ref = new ComponentReference(name, id, vars, null, { ...options, lazy: true });
        if (this[REACTOR]) {
            this[REACTOR]._instanceRegistry.startEagerCreation(ref);
        }
        return ref;
    }

    /**
     * Declare a library dependency to be loaded in parallel with child templates.
     * Non-blocking — the framework starts loading the module immediately.
     * Access the loaded module later via library() in hydrate(), which returns
     * the full module object (like dynamic import()).
     * @param {string} name - Library name (resolved as basePath/name.js)
     */
    loadLibrary(name) {
        if (!this[LIBRARIES]) this[LIBRARIES] = new Map();
        const basePath = this[REACTOR]._basePath;
        const promise = import(`${basePath}/${name}.js`);
        this[LIBRARIES].set(name, { promise, module: null });
    }

    /**
     * Access a loaded library module. Returns the full module object, like
     * dynamic import(). Only available in hydrate() or later — the framework
     * resolves all library promises between render and hydrate.
     * @param {string} name - Library name (same as passed to loadLibrary)
     * @returns {Object.<string, *>} The full module object (destructure to get exports)
     */
    library(name) {
        const libs = this[LIBRARIES];
        if (!libs || !libs.has(name)) {
            throw new Error(`Library "${name}" not loaded — call loadLibrary("${name}") in init()`);
        }
        const entry = libs.get(name);
        if (!entry.module) {
            throw new Error(
                `Library "${name}" not yet resolved — library() can only be called in hydrate() or later`,
            );
        }
        return entry.module;
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
     * @param {function(...*): (void|false)} handler - Callback invoked when the event fires
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
     * Broadcast an event top-down through this component and its children.
     * Propagation is scoped to this component's subtree only — it does not
     * reach parent or sibling components. Use reactor.broadcast() for
     * application-wide broadcasts (e.g., theming).
     * @param {string} eventName - Event name to broadcast
     * @param {...*} args - Arguments forwarded to each handler
     */
    broadcast(eventName, ...args) {
        if (this[LIFECYCLE_ACTIVE]) {
            this[CONSOLE].warn(
                `broadcast('${eventName}') called during ${this[LIFECYCLE_ACTIVE]}() — listeners may not be registered yet`,
            );
        }
        if (!this[REACTOR]) {
            throw new Error('Component: Cannot broadcast - reactor not attached');
        }
        this[REACTOR].broadcastFrom(this[COMPONENT_ID], eventName, ...args);
    }

    /**
     * Query this component's own DOM for the first element matching a CSS selector,
     * excluding child component subtrees.
     * @param {string} selector - CSS selector
     * @returns {Element|null} The first matching element, or null if none found
     */
    querySelector(selector) {
        return this.componentContainer.querySelector(this._scopeSelector(selector));
    }

    /**
     * Query this component's own DOM for all elements matching a CSS selector,
     * excluding child component subtrees.
     * @param {string} selector - CSS selector
     * @returns {Array.<Element>} Array of matching elements
     */
    querySelectorAll(selector) {
        return Array.from(this.componentContainer.querySelectorAll(this._scopeSelector(selector)));
    }

    /**
     * Find elements by class name within this component's own DOM,
     * excluding child component subtrees.
     * Accepts space-separated class names (same as Element.getElementsByClassName).
     * @param {string} classNames - One or more class names separated by spaces
     * @returns {Array.<Element>} Array of matching elements
     */
    getElementsByClassName(classNames) {
        const selector = classNames
            .trim()
            .split(/\s+/)
            .map((c) => `.${CSS.escape(c)}`)
            .join('');
        return this.querySelectorAll(selector);
    }

    /**
     * Append a child-exclusion pseudo-class to each comma-separated part of a selector
     * so the browser never matches nodes inside child component mount points.
     * @param {string} selector - Original CSS selector
     * @returns {string} Scoped selector with :not() exclusion appended
     */
    _scopeSelector(selector) {
        const escapedCode = this[COMPONENT_ID].code.replace(/["\\]/g, '\\$&');
        const exclusion = `:not([data-fusewire-parent-id="${escapedCode}"] *)`;
        return selector
            .split(',')
            .map((part) => part.trim() + exclusion)
            .join(', ');
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
