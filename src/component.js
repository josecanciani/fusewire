import { ComponentId } from './component-id.js';
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

/**
 * @typedef {{
 *   fallback?: string
 * }} ChildOptions
 */

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{[key: string]: Scalar|Array.<Scalar>|Object}} ScalarObject */
/** @typedef {Scalar|ScalarObject|Component|Child} VarValue */
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
     * Component and Child — call `ref.update({ badge: '2' })`
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
     * @param {string|ComponentVars} [idOrVars] - Instance id, or vars if id is omitted
     * @param {ComponentVars|import('./component.js').ChildOptions} [maybeVarsOrOptions] - Vars when id is provided, or options when id is omitted
     * @param {import('./component.js').ChildOptions} [maybeOptions] - Options when id and vars are provided
     * @returns {Component|Child} Reference that the framework replaces with the real instance after mounting
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
        const ref = new Child(name, id, vars, null, options);
        this[REACTOR]._instanceRegistry.startEagerCreation(ref);
        return ref;
    }

    /**
     * Create a lazy child component that loads in the background.
     * The parent renders immediately with a placeholder component. When the
     * real child is ready, the framework swaps the placeholder for the real
     * component and triggers a re-render of the parent.
     * @param {Component|Child} lazyChild - The child reference to load lazily
     * @param {Component|Child} placeholderChild - Placeholder to show while loading
     * @returns {Component|Child} Reference that the framework replaces with the real instance after mounting
     */
    createLazyChild(lazyChild, placeholderChild) {
        return this.createChild('FuseWire/Lazy', '', { lazyChild, placeholderChild });
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
     * @returns {HTMLElement|null} The first matching element, or null if none found
     */
    querySelector(selector) {
        return /** @type {HTMLElement|null} */ (
            this.componentContainer.querySelector(this._scopeSelector(selector))
        );
    }

    /**
     * Query this component's own DOM for all elements matching a CSS selector,
     * excluding child component subtrees.
     * @param {string} selector - CSS selector
     * @returns {Array.<HTMLElement>} Array of matching elements
     */
    querySelectorAll(selector) {
        return /** @type {Array.<HTMLElement>} */ (
            Array.from(this.componentContainer.querySelectorAll(this._scopeSelector(selector)))
        );
    }

    /**
     * Find elements by class name within this component's own DOM,
     * excluding child component subtrees.
     * Accepts space-separated class names (same as Element.getElementsByClassName).
     * @param {string} classNames - One or more class names separated by spaces
     * @returns {Array.<HTMLElement>} Array of matching elements
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
     * Returns a promise that resolves when the render queue has drained,
     * enabling callers to chain post-render work via `.then()`.
     * @param {string} mode - Render mode ('CSR' for client-side only)
     * @returns {Promise<void>} Resolves when the render queue drains (or immediately if ignored)
     */
    react(mode = 'CSR') {
        if (this[LIFECYCLE_ACTIVE]) {
            this[CONSOLE].warn(
                `react() called during ${this[LIFECYCLE_ACTIVE]}() — ignored (the framework renders automatically after lifecycle hooks)`,
            );
            return this[REACTOR]._drainPromise;
        }
        return this[REACTOR].react(this[COMPONENT_ID], mode);
    }
}

/**
 * Child - A lightweight declaration of a child component.
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
export class Child {
    /**
     * Create a new Child
     * @param {string} componentName - Component name for template/class resolution
     * @param {string} id - Instance identifier (may be empty)
     * @param {ComponentVars} vars - Initial variables for the component
     * @param {string|null} version - Template version hash, or null for latest
     * @param {ChildOptions} options - Creation options (fallback)
     */
    constructor(componentName, id = '', vars = {}, version = null, options = {}) {
        if (!componentName || typeof componentName !== 'string') {
            throw new Error('Child: componentName must be a non-empty string');
        }
        this.componentName = componentName;
        this.id = id;
        this.vars = vars;
        this.version = version;
        this._options = options;
        this._replaced = false;
        this._bufferedEvents = [];
        this._creationPromise = null;
        this._detachedContainer = null;
        this._creationError = null;
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
                `Child: update() called on replaced reference "${this.toComponentId().code}". ` +
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
                `Child: on() called on replaced reference "${this.toComponentId().code}". ` +
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
     * @param {import('./component.js').Component} component - The fully loaded component instance
     */
    _replayBufferedEvents(component) {
        for (const entry of this._bufferedEvents) {
            if (!entry.removed) {
                entry.realUnsub = component.on(entry.eventName, entry.handler);
            }
        }
        this._bufferedEvents = [];
    }

    /**
     * Returns a promise that resolves to the fully created Component instance
     * once its background creation pipeline (loading, init, and rendering) is complete.
     * Use this when you need to safely interact with a child component instance.
     * @returns {Promise<import('./component.js').Component|null>} The created component instance or null
     */
    whenReady() {
        return this._creationPromise || Promise.resolve(null);
    }
}

export class Lazy extends Component {
    static componentName = 'FuseWire/Lazy';

    /** @type {Child} */
    child;

    /** @type {Child} */
    lazyChild;

    /** @type {Child} */
    placeholderChild;

    async init() {
        this.child = this.placeholderChild;
        this.lazyChild
            .whenReady()
            .then(() => {
                this.update({ child: this.lazyChild });
            })
            .catch((err) => {
                this.lazyChild._creationError = err;
                this.update({ child: this.lazyChild });
            });
    }
}
