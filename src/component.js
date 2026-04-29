import { ComponentId } from './component-id.js';
import { EventEmitter } from './event-emitter.js';
import {
    COMPONENT_ID,
    REGISTRY_ENTRY,
    CONSOLE,
    REACTOR,
    LIFECYCLE_ACTIVE,
    EVENTS,
    ROUTE_DEFAULTS,
} from './symbols.js';

/**
 * Configuration options for child components.
 * @typedef {{
 *   fallback?: string
 * }} ChildOptions
 */

/**
 * Primitive data types that can be directly mapped to DOM attributes or state serialization.
 * @typedef {string|number|boolean|null} Scalar
 */
/**
 * Represents a plain object containing only Scalar values, Arrays of Scalars, or nested ScalarObjects.
 * @typedef {{[key: string]: Scalar|Array.<Scalar>|Object<string, *>}} ScalarObject
 */
/**
 * Represents any valid value type that can be assigned to a component variable.
 * @typedef {Scalar|ScalarObject|Component|Child} VarValue
 */
/**
 * A dictionary of key-value pairs assigned to a component.
 * @typedef {{[key: string]: (VarValue|Array<VarValue>)}} ComponentVars
 */
/**
 * A class constructor that instantiates a Component.
 * @typedef {{new(): Component, componentName: string}} ComponentConstructor
 */

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
     * Convert to ComponentId
     * @returns {ComponentId} The component id
     */
    toComponentId() {
        return new ComponentId(this.componentName, this.componentId, this.componentVersion);
    }

    /**
     * Init hook - called after vars are set and framework is wired, before first render.
     * Override in subclasses for initialization logic.
     *
     * When restoring a previously destroyed component, the framework passes the
     * object returned by the previous destroy() call as previousState. Use this
     * to skip expensive fetches and restore private fields instead.
     *
     * When a HistoryRouter is active, routeSegment contains the parsed URL
     * segment for this component. Use it to set state before the first render
     * so there is no flash from defaults to URL values.
     *
     * @async
     * @param {Object<string, *>|null} previousState - State returned by the previous destroy(), or null on fresh mount
     * @param {import('./route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment, or null when no router or no matching segment
     * @returns {Promise<void>}
     */
    async init(previousState, routeSegment) {
        void previousState; // Bypass unused variable linter
        void routeSegment;
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
     * When a HistoryRouter is active, routeSegment is provided during popstate
     * (browser back/forward). The base implementation auto-maps segment
     * properties onto the component vars declared by routeState(). Override
     * this method when you need custom logic (e.g. type coercion beyond
     * simple strings, derived state computation).
     *
     * Subclasses can override to add custom logic (e.g. validation or
     * derived state), and must call `super.update(newVars, react)` to
     * apply the merge and trigger re-render.
     *
     * @param {ComponentVars} newVars - Vars to merge into the component
     * @param {boolean} react - Whether to trigger a re-render (default true)
     * @param {import('./route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment during popstate, or null
     * @returns {Promise<void>} Promise that resolves when the re-render is complete (if react is true)
     */
    update(newVars, react = true, routeSegment = null) {
        // Auto-map route segment properties to component vars when routeState
        // declares the property names. This default mapping uses raw strings;
        // components needing typed values should override update().
        if (routeSegment) {
            const state = this.routeState();
            if (state !== false) {
                const defaults = this[ROUTE_DEFAULTS];
                for (const key of Object.keys(state)) {
                    const value = routeSegment.get(key);
                    if (value !== null) {
                        this[key] = value;
                    } else if (defaults && key in defaults) {
                        // Property absent from URL — reset to pre-init default
                        this[key] = defaults[key];
                    }
                }
            }
        }
        Object.assign(this, newVars);
        return react ? this.react() : Promise.resolve();
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
     * @returns {Child|Component} Reference that the framework replaces with the real instance after mounting
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
        this[REACTOR].instanceRegistry.startEagerCreation(ref);
        return ref;
    }

    /**
     * Create a lazy child component that loads in the background.
     * The parent renders immediately with a placeholder component. When the
     * real child is ready, the framework swaps the placeholder for the real
     * component and triggers a re-render of the parent.
     * @param {Component|Child} lazyChild - The child reference to load lazily
     * @param {Component|Child} placeholderChild - Placeholder to show while loading
     * @returns {Child|Component} Reference that the framework replaces with the real instance after mounting
     */
    createLazyChild(lazyChild, placeholderChild) {
        if (!placeholderChild) {
            throw new Error(
                'createLazyChild requires a placeholderChild parameter to display while loading',
            );
        }
        const baseId = lazyChild.toComponentId().code;
        return this.createChild('FuseWire/Lazy', `${baseId}-lazy`, {
            lazyChild,
            placeholderChild,
        });
    }

    /**
     * Create a child component wrapped in an error boundary.
     * If the child fails to initialize or render, the framework will catch the
     * `fw-error` event and automatically render the fallback component instead.
     * @param {Component|Child} targetChild - The child reference to mount
     * @param {Component|Child|string} fallbackChildOrName - Fallback child reference or component name if targetChild fails
     * @returns {Child|Component} Boundary reference that manages the child lifecycle
     */
    createErrorBoundedChild(targetChild, fallbackChildOrName) {
        if (!fallbackChildOrName) {
            throw new Error(
                'createErrorBoundedChild requires a fallbackChildOrName parameter to display when an error occurs',
            );
        }
        const baseId = targetChild.toComponentId().code;
        const fallbackChild =
            typeof fallbackChildOrName === 'string'
                ? this.createChild(fallbackChildOrName, `${baseId}-eb-fallback`)
                : fallbackChildOrName;
        return this.createChild('FuseWire/ErrorBoundary', `${baseId}-eb`, {
            targetChild,
            fallbackChild,
        });
    }

    /**
     * Create a PortalHost at this location in the DOM.
     * The PortalHost renders its portal children via fw-each, escaping the
     * current component's CSS stacking context.
     * @param {string} id - Unique identifier for this portal host
     * @returns {Child|Component} The PortalHost reference (place in template as ((varName)))
     */
    createPortalHost(id) {
        return this.createChild('FuseWire/PortalHost', id);
    }

    /**
     * Create a child that renders in a PortalHost instead of this component's DOM.
     * The returned reference is a PortalChild proxy — it lives in this component's
     * tree (for lifecycle and events) but the real child renders in the PortalHost.
     * @param {string} name - Component name (e.g. 'Cart/Modal')
     * @param {string} id - Instance id
     * @param {ComponentVars} [vars] - Initial vars for the real child
     * @param {string} [portalHostId='default'] - ID of the target PortalHost
     * @returns {Child|Component} PortalChild proxy reference (place in template as ((varName)))
     */
    createPortalChild(name, id, vars, portalHostId) {
        return this.createChild('FuseWire/PortalChild', `${name}-${id}-portal`, {
            targetName: name,
            targetId: id,
            targetVars: vars || {},
            portalHostId: portalHostId || 'default',
        });
    }

    /**
     * Declare a library dependency to be loaded in parallel with child templates.
     * Non-blocking — the framework starts loading the module immediately.
     * Access the loaded module later via library() in hydrate(), which returns
     * the full module object (like dynamic import()).
     * @param {string} name - Library name (resolved as basePath/name.js)
     */
    loadLibrary(name) {
        this[REACTOR].loadLibraryForComponent(this, name);
    }

    /**
     * Pre-fetch a component's class and template in the background.
     * Returns a Promise that resolves to a factory function for creating
     * child instances of that component. The factory is a shorthand for
     * createChild() with the component name already bound — call it as
     * factory(id, vars).
     *
     * Use this inside Promise.all() to parallelize component loading with
     * data fetching:
     *
     *   const [createItem, data] = await Promise.all([
     *       this.load('List/Item'),
     *       fetch('/api/data').then(r => r.json()),
     *   ]);
     *   this.items = data.map(d => createItem(d.id, { name: d.name }));
     *
     * @param {string} name - Component name (e.g., 'List/Item', 'Common/Header')
     * @returns {Promise<function(string, import('./component.js').ComponentVars): (Child|Component)>} Factory function
     */
    load(name) {
        return this[REACTOR].loadComponentFactory(this, name);
    }

    /**
     * Access a loaded library module. Returns the full module object, like
     * dynamic import(). Only available in hydrate() or later — the framework
     * resolves all library promises between render and hydrate.
     * @param {string} name - Library name (same as passed to loadLibrary)
     * @returns {Object<string, *>} The full module object (destructure to get exports)
     */
    library(name) {
        return this[REACTOR].getLibraryForComponent(this, name);
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
     * Emit an event and check if propagation was stopped.
     * Works like emit(), but returns true if any handler returned false.
     * @param {string} eventName - Event name to emit
     * @param {...*} args - Arguments forwarded to each handler
     * @returns {boolean} True if propagation was stopped
     */
    emitCancellable(eventName, ...args) {
        if (this[LIFECYCLE_ACTIVE]) {
            this[CONSOLE].warn(
                `emitCancellable('${eventName}') called during ${this[LIFECYCLE_ACTIVE]}() — listeners may not be registered yet`,
            );
        }
        if (!this[EVENTS]) return false;

        // We can reuse emitBroadcast logic from EventEmitter since it already tracks 'stopped'
        const result = this[EVENTS].emitBroadcast(eventName, ...args);
        for (const err of result.errors) {
            this[CONSOLE].error(`emitCancellable('${eventName}') listener threw: ${err.message}`);
        }
        return result.stopped;
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
     * Declare this component's contribution to the URL.
     * Override to opt into routing.
     *
     * Return values:
     * - `false` — not routed; skip this component and its entire subtree
     * - `{}` — structural pass-through; no URL segment, but children are walked
     * - `{ key: value, ... }` — routed; keys become URL property names
     *
     * @returns {false|Object<string, string>} Route state object, empty object for pass-through, or false to opt out
     */
    routeState() {
        return false;
    }

    /**
     * Serialize the full component tree and push a new browser history entry.
     * Use for navigations the user expects to undo with the Back button.
     * Delegates to the HistoryRouter injected into the Reactor.
     * @throws {Error} If no HistoryRouter is configured on the reactor
     */
    pushRoute() {
        if (!this[REACTOR].router) {
            throw new Error('pushRoute() requires a HistoryRouter on the Reactor');
        }
        this[REACTOR].router.pushUrl();
    }

    /**
     * Serialize the full component tree and replace the current browser history entry.
     * Use for transient state changes (sort order, filters) that shouldn't clutter history.
     * Delegates to the HistoryRouter injected into the Reactor.
     * @throws {Error} If no HistoryRouter is configured on the reactor
     */
    replaceRoute() {
        if (!this[REACTOR].router) {
            throw new Error('replaceRoute() requires a HistoryRouter on the Reactor');
        }
        this[REACTOR].router.replaceUrl();
    }

    /**
     * Trigger re-render of this component.
     * Ignored during initialization lifecycle hooks (init, update) because
     * the framework already renders the component natively after those hooks return.
     * Returns a promise that resolves when the render queue has drained,
     * enabling callers to chain post-render work via `.then()`.
     * @param {string} mode - Render mode ('CSR' for client-side only)
     * @returns {Promise<void>} Resolves when the render queue drains (or immediately if ignored)
     */
    react(mode = 'CSR') {
        const active = this[LIFECYCLE_ACTIVE];
        if (active === 'init' || active === 'update') {
            this[CONSOLE].warn(
                `react() called during ${active}() — ignored (the framework renders automatically after init/update)`,
            );
            return this[REACTOR].drainPromise;
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
     * @param {import('./component.js').ChildOptions} options - Creation options
     */
    constructor(componentName, id = '', vars = {}, version = null, options = {}) {
        if (!componentName || typeof componentName !== 'string') {
            throw new Error('Child: componentName must be a non-empty string');
        }
        this[COMPONENT_ID] = new ComponentId(componentName, id, version || '');
        this.vars = vars;
        this._options = options;
        this._listeners = new Map();
        /** 
         * Buffered events emitted during eager creation before mounting.
         * @type {any[]} 
         */
        this._bufferedEvents = [];
        this._realInstance = null;
        this._replaced = false;
        this._creationPromise = null;
        this._detachedContainer = null;
        this._creationError = null;
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
     * Build a ComponentId from this reference
     * @returns {ComponentId} The corresponding ComponentId
     */
    toComponentId() {
        return this[COMPONENT_ID];
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
     * @returns {Promise<void>} A resolved promise for compatibility with Component.update()
     */
    update(newVars) {
        if (this._replaced) {
            throw new Error(
                `Child: update() called on replaced reference "${this.toComponentId().code}". ` +
                    'Use the Component instance from vars instead.',
            );
        }
        Object.assign(this.vars, newVars);

        // If the framework has already started eager creation of this child, we must push the updates
        // to the real instance once it's created, otherwise they will be swallowed by the race condition.
        if (this._creationPromise) {
            this._creationPromise
                .then((/** @type {Component} */ instance) => {
                    instance.update(newVars, true);
                })
                .catch(() => {});
        }

        return Promise.resolve();
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
        const entry = {
            eventName,
            handler,
            removed: false,
            realUnsub: /** @type {function(): void | null} */ (null),
        };
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
     * Emit an event to buffered listeners.
     * Used to emit 'fw-error' when component creation fails.
     * If any handler returns false, propagation is stopped.
     * @param {string} eventName - Event name
     * @param {...*} args - Arguments forwarded to each handler
     * @returns {boolean} True if any handler returned false (propagation stopped)
     */
    _emitBuffered(eventName, ...args) {
        let stopped = false;

        // If already replaced, emit on the real instance since listeners were replayed.
        // We don't iterate buffered events here because they were moved to the instance.
        if (this._replaced && this._realInstance) {
            return this._realInstance.emitCancellable(eventName, ...args);
        }

        for (const entry of this._bufferedEvents) {
            if (!entry.removed && entry.eventName === eventName) {
                try {
                    if (entry.handler(...args) === false) {
                        stopped = true;
                    }
                } catch (e) {
                    console.error(`_emitBuffered('${eventName}') listener threw:`, e);
                }
            }
        }
        return stopped;
    }

    /**
     * Replay buffered event subscriptions on the real Component instance.
     * Called by the InstanceRegistry after the real Component is created and
     * the reference is replaced in the parent's vars.
     * @param {import('./component.js').Component} component - The fully loaded component instance
     */
    _replayBufferedEvents(component) {
        this._realInstance = component;
        for (const entry of this._bufferedEvents) {
            if (!entry.removed) {
                entry.realUnsub = component.on(entry.eventName, entry.handler);
            }
        }
        // Do NOT clear _bufferedEvents yet, we might need them for _emitBuffered if hydration fails
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

/**
 * Built-in lazy-loading wrapper component.
 * Renders a placeholder until the real child is ready, then swaps it in.
 */
export class Lazy extends Component {
    static componentName = 'FuseWire/Lazy';

    /** 
     * The currently rendered child (switches from placeholder to lazyChild).
     * @type {Child} 
     */
    child;

    /** 
     * The heavy child component being loaded in the background.
     * @type {Child} 
     */
    lazyChild;

    /** 
     * The temporary placeholder shown while lazyChild is loading.
     * @type {Child} 
     */
    placeholderChild;

    /**
     * Show placeholder immediately; swap in the real child once ready or handle load errors.
     */
    async init() {
        this.child = this.placeholderChild;
        this.lazyChild
            .whenReady()
            .then(() => {
                this.update({ child: this.lazyChild });
            })
            .catch((err) => {
                this.console.error(
                    `Lazy load failed for ${this.lazyChild.componentName}: ${err.message}`,
                );
                this.lazyChild._creationError = err;
                const handled = this.lazyChild._emitBuffered('fw-error', {
                    error: err,
                    failedComponent: this.lazyChild.componentName,
                });
                if (!handled) {
                    // Bubble the error up to the Lazy component's parent
                    const parentHandled = this.emitCancellable('fw-error', {
                        error: err,
                        failedComponent: this.lazyChild.componentName,
                    });
                    if (!parentHandled) {
                        // Unhandled error in background load propagates globally
                        throw err;
                    }
                }
            });
    }
}

/**
 * Built-in error boundary component.
 * Catches fw-error events from a target child and renders a fallback instead.
 * Acts as a routing pass-through so the router can reach routed children.
 */
export class ErrorBoundary extends Component {
    static componentName = 'FuseWire/ErrorBoundary';

    /** 
     * The currently rendered child (switches from target to fallback on error).
     * @type {Child|Component} 
     */
    child;

    /** 
     * The primary child component being protected.
     * @type {Child} 
     */
    targetChild;

    /** 
     * The component shown when targetChild emits fw-error.
     * @type {Child} 
     */
    fallbackChild;

    /**
     * Wire fw-error listener: on failure, update the fallback vars and swap child to fallback.
     */
    async init() {
        if (!this.child) {
            this.child = this.targetChild;
        }

        this.targetChild.on('fw-error', (ctx) => {
            this.fallbackChild.update({
                errorMessage: ctx.error.message,
                failedComponent: ctx.failedComponent,
            });
            this.update({
                child: this.fallbackChild,
            }).then(() => this.emit('error', ctx));
            return false; // Prevent further bubbling
        });
    }

    /**
     * Pass-through for routing — no URL segment of its own, but the router
     * walks through to reach routed children (e.g. the wrapped component).
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}

/**
 * Built-in root wrapper component.
 * Created automatically by reactor.start() to wrap the user's app component
 * and the default PortalHost. The user never interacts with this directly.
 */
export class Root extends Component {
    static componentName = 'FuseWire/Root';

    /** 
     * The main application component.
     * @type {Child|Component} 
     */
    app;

    /** 
     * The framework's default portal host.
     * @type {Child|Component} 
     */
    portal;

    /**
     * Pass-through for routing — the router walks through to reach the app.
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}

/**
 * Built-in portal host component.
 * Renders portal children via fw-each. Registers itself with the Reactor
 * so PortalChild instances can connect by ID. Intercepts child events via
 * wildcard on('*') and wraps them as fw-portal-event for PortalChild to unpack.
 *
 * PortalHost subtrees are excluded from broadcast tree walks to prevent
 * double-delivery — broadcasts reach portal children via PortalChild forwarding.
 */
export class PortalHost extends Component {
    static componentName = 'FuseWire/PortalHost';

    /** 
     * The list of children currently rendered in this portal.
     * @type {Array<Child|Component>} 
     */
    children = [];

    /**
     * Register this host with the reactor so PortalChild instances can find it.
     */
    async init() {
        this[REACTOR].registerPortalHost(this[COMPONENT_ID].id, this);
    }

    /**
     * Add a child component to render in this portal.
     * Subscribes to all child events via wildcard and wraps them as
     * fw-portal-event so PortalChild can forward them to the logical parent.
     * @param {string} name - Component name (e.g. 'Cart/Modal')
     * @param {string} id - Instance id
     * @param {ComponentVars} vars - Initial vars for the child
     * @returns {Child|Component} The child reference
     */
    addChild(name, id, vars) {
        const child = this.createChild(name, id, vars);
        this.children.push(child);

        // Intercept ALL events from this child and wrap them
        child.on('*', (eventName, ...args) => {
            this.emit('fw-portal-event', {
                childCode: child.componentCode,
                eventName,
                args,
            });
        });

        this.react();
        return child;
    }

    /**
     * Remove a child by component code.
     * Called by PortalChild.destroy() to clean up the real child.
     * @param {string} childCode - Component code to remove (e.g. 'Cart/Modal#main')
     */
    removeChild(childCode) {
        this.children = this.children.filter((c) => c.componentCode !== childCode);
        this.react();
    }

    /**
     * Broadcast an event to a specific child's subtree.
     * Called by PortalChild to forward broadcasts from the main tree.
     * @param {string} childCode - Target child component code
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Event arguments
     */
    broadcastToChild(childCode, eventName, args) {
        const child = this.children.find((c) => c.componentCode === childCode);
        if (child instanceof Component) {
            child.broadcast(eventName, ...args);
        }
    }

    /**
     * Unregister from the reactor on destruction.
     */
    destroy() {
        this[REACTOR].unregisterPortalHost(this[COMPONENT_ID].id);
    }

    /**
     * Pass-through for routing — PortalHost does not contribute URL state.
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}

/**
 * Built-in portal child proxy component.
 * Lives in the requesting component's tree with an empty template.
 * Connects to a PortalHost by ID (via the Reactor) and forwards events
 * bidirectionally: child emissions are unpacked from fw-portal-event,
 * broadcasts are forwarded via host.broadcastToChild().
 */
export class PortalChild extends Component {
    static componentName = 'FuseWire/PortalChild';

    /** 
     * Component name of the child to render in the portal (e.g. 'Modal').
     * @type {string} 
     */
    targetName;

    /** 
     * Instance id for the portal child.
     * @type {string} 
     */
    targetId;

    /** 
     * Initial variables to pass to the portal child.
     * @type {ComponentVars} 
     */
    targetVars;

    /** 
     * The ID of the PortalHost where this child should be rendered.
     * @type {string} 
     */
    portalHostId;

    /** 
     * The internal component code string for tracking.
     * @type {string} 
     */
    #childCode;

    /** 
     * The actual component instance rendered in the host.
     * @type {Component} 
     */
    #realChild;

    /**
     * Connect to the PortalHost and request creation of the real child.
     * Subscribes to fw-portal-event on the host and re-emits matching
     * events on this component so the parent's .on() handlers fire.
     */
    async init() {
        const host = await this[REACTOR].getPortalHost(this.portalHostId);

        const childRef = host.addChild(this.targetName, this.targetId, this.targetVars);
        this.#childCode = childRef.componentCode;

        // Forward wrapped events from PortalHost → re-emit on self
        host.on(
            'fw-portal-event',
            /**
             * Handle wrapped events from the PortalHost
             * @param {{childCode: string, eventName: string, args: any[]}} evt - The wrapped event
             */
            (evt) => {
                if (evt.childCode === this.#childCode) {
                    this.emit(evt.eventName, ...evt.args);
                }
            },
        );

        this.#realChild = await childRef.whenReady();
    }

    /**
     * Clean up the real child from the PortalHost.
     */
    destroy() {
        const host = this[REACTOR].getPortalHostSync(this.portalHostId);
        host.removeChild(this.#childCode);
    }

    /**
     * Get the component code of the real child in the PortalHost.
     * Used by _broadcastToEntry for forwarding broadcasts.
     * @returns {string} The real child's component code
     */
    getChildCode() {
        return this.#childCode;
    }

    /**
     * Get the real child Component instance from the PortalHost.
     * @returns {Component} The real child instance
     */
    getChild() {
        return this.#realChild;
    }
}
