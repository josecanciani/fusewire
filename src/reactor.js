import { ComponentId } from './component-id.js';
import { Child } from './component.js';
import { EventEmitter } from './event-emitter.js';
import { FuseWire } from './fusewire.js';
import { TemplateStore } from './template-store.js';
import { InstanceRegistry } from './instance.js';
import { Renderer } from './renderer.js';
import { Idiomorph } from 'idiomorph';
import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { Persistence } from './persistence.js';
import { StateSerializer } from './state-serializer.js';
import { HistoryRouter } from './history-router.js';
import { REACTOR, LIFECYCLE_ACTIVE, LIBRARIES } from './symbols.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {{log: function(...*): void, warn: function(...*): void, error: function(...*): void}} ConsoleLike */
/** @typedef {{stringify: function(ComponentVars): string, parse: function(string): ComponentVars}} SerializerLike */
/** @typedef {{console?: Console, templateStore?: TemplateStore, renderer?: Renderer, morphFunction?: function(HTMLElement, string, Object<string, *>=): void, instanceRegistry?: InstanceRegistry, basePath?: string, globalVars?: ComponentVars, enableDefaultConsole?: boolean, persistence?: Persistence, serializer?: SerializerLike, router?: import('./history-router.js').HistoryRouter|null}} ReactorConfig */

/**
 * Reactor - Orchestrator for CSR_ONLY mode
 *
 * Manages component lifecycle and rendering using InstanceRegistry.
 * In Phase 1, supports client-side rendering only.
 */
export class Reactor {
    /**
     * Create a new Reactor
     * @param {string} appName - Application name (must be a valid CSS class name)
     * @param {ReactorConfig} config - Configuration options
     */
    constructor(appName = 'default', config = {}) {
        // Validate appName is a valid CSS class name
        if (!/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(appName)) {
            throw new Error(`Reactor: appName "${appName}" is not a valid CSS class name`);
        }

        // Check for duplicate app names
        if (FuseWire.has(appName)) {
            throw new Error(`Reactor: appName "${appName}" is already registered`);
        }

        this._config = config;
        this._appName = appName;
        this._basePath = config.basePath || './components';
        this._rootContainer = null;
        this._defaultConsole = config.console ?? globalThis.console;
        this._enableDefaultConsole = config.enableDefaultConsole ?? false;
        /** @type {any[]} */
        this._attachedConsoles = [];
        /** @type {ConsoleLike} */
        this._console = this._buildConsoleMultiplexer();

        // Render queue — serializes all react() calls so only one render chain
        // runs at a time. Keyed by component code for O(1) dedup.
        /** @type {Map<string, {id: ComponentId, mode: string}>} */
        this._queue = new Map();
        this._draining = false;
        /** @type {Promise<void>} */
        this._drainPromise = Promise.resolve();

        // Auto-create dependencies if not provided
        this._templateStore = config.templateStore || new TemplateStore();

        // Renderer setup - use Idiomorph by default, allow override for tests
        if (!config.renderer) {
            const morphFunction =
                config.morphFunction ||
                /** @type {function(HTMLElement, string, Object<string, *>=): void} */ (
                    Idiomorph.morph
                );
            this._renderer = new Renderer(morphFunction, this._appName);
        } else {
            this._renderer = config.renderer;
        }

        // Persistence — manages storing component state across destroy/recreate cycles.
        /** @type {Persistence} */
        this.persistence =
            config.persistence || new Persistence(config.serializer || new StateSerializer());

        // Router — HistoryRouter for URL-based state management.
        // Auto-created by default; pass null to disable.
        // Must be attached before start() so init() can receive route segments.
        /** @type {import('./history-router.js').HistoryRouter|null} */
        this.router = config.router === null ? null : config.router || new HistoryRouter();
        if (this.router) {
            this.router.attach(this);
        }

        this._instanceRegistry =
            config.instanceRegistry ||
            new InstanceRegistry(
                this._renderer,
                this._templateStore,
                this._appName,
                this.persistence,
            );

        // Give registry a reference to this reactor so auto-mounted children get _reactor
        this._instanceRegistry._reactor = this;
        this._instanceRegistry.persistence = this.persistence;

        // Register this reactor with FuseWire global registry
        FuseWire.register(this._appName, this);

        // Global vars — merged into every render's var context with lower priority
        // than component-local vars. Configured at construction time via config.globalVars.
        /** @type {ComponentVars} */
        this._globalVars = { ...config.globalVars };

        // Portal host registry — PortalHost components register themselves here
        // so PortalChild instances can find them by ID.
        /** @type {Map<string, import('./component.js').PortalHost>} */
        this._portalHosts = new Map();
        /** @type {Map<string, Array<{resolve: function(import('./component.js').PortalHost): void}>>} */
        this._pendingPortalRequests = new Map();
    }

    /**
     * Get the instance registry for this reactor
     * @returns {InstanceRegistry} The instance registry
     */
    get instanceRegistry() {
        return this._instanceRegistry;
    }

    /**
     * Get the console for this reactor
     * @returns {ConsoleLike} Console-like object
     */
    get console() {
        return this._console;
    }

    /**
     * Get the base path for component files
     * @returns {string} Base URL path for component file resolution
     */
    get basePath() {
        return this._basePath;
    }

    /**
     * Get the global vars merged into every render context
     * @returns {ComponentVars} Global vars object
     */
    get globalVars() {
        return this._globalVars;
    }

    /**
     * Get a promise that resolves when the current render drain completes.
     * Used by Component.react() to return a promise the caller can await.
     * @returns {Promise<void>} Promise that resolves when draining finishes
     */
    get drainPromise() {
        return this._drainPromise;
    }

    /**
     * Attach an additional console-like object to receive log messages.
     * Messages are forwarded to both the default console and all attached consoles.
     * @param {ConsoleLike} consoleObj - Object with log, warn, and error methods
     */
    attachConsole(consoleObj) {
        this._attachedConsoles.push(consoleObj);
    }

    /**
     * Detach a previously attached console-like object.
     * @param {ConsoleLike} consoleObj - The same object passed to attachConsole
     */
    detachConsole(consoleObj) {
        const index = this._attachedConsoles.indexOf(consoleObj);
        if (index !== -1) this._attachedConsoles.splice(index, 1);
    }

    /**
     * Subscribe to a broadcast event at the reactor level.
     * Reactor listeners fire before component listeners during broadcast().
     * Returns an unsubscribe function.
     * @param {string} eventName - Event name to listen for
     * @param {function(...*): (void|false)} handler - Callback invoked when the event is broadcast
     * @returns {function(): void} Unsubscribe function
     */
    on(eventName, handler) {
        if (!this._events) this._events = new EventEmitter();
        return this._events.on(eventName, handler);
    }

    /**
     * Broadcast an event top-down through the entire component tree.
     * Reactor-level listeners (registered via reactor.on()) fire first,
     * then the event propagates from root component(s) down to all children.
     * If a component handler returns false, propagation stops for that subtree.
     * @param {string} eventName - Event name to broadcast
     * @param {...*} args - Arguments forwarded to each handler
     */
    broadcast(eventName, ...args) {
        if (this._events) {
            for (const err of this._events.emit(eventName, ...args)) {
                this._console.error(
                    `broadcast('${eventName}') reactor listener threw: ${/** @type {Error} */ (err).message}`,
                );
            }
        }
        this._instanceRegistry.broadcastFromRoots(eventName, args);
    }

    /**
     * Broadcast an event top-down starting from a specific component and its children.
     * Used by Component.broadcast() for subtree-scoped propagation.
     * @param {ComponentId} componentId - Component to broadcast from
     * @param {string} eventName - Event name to broadcast
     * @param {...*} args - Arguments forwarded to each handler
     */
    broadcastFrom(componentId, eventName, ...args) {
        this._instanceRegistry.broadcastFrom(componentId, eventName, args);
    }

    /**
     * Build a console multiplexer that forwards calls to the default console
     * and all currently attached consoles.
     * @private
     * @returns {ConsoleLike} Multiplexing console object
     */
    _buildConsoleMultiplexer() {
        const defaultConsole = this._defaultConsole;
        const attached = this._attachedConsoles;
        const enabled = this._enableDefaultConsole;
        return {
            /**
             * Forwarding utility
             * @param {...*} args - Logging arguments
             */
            log(...args) {
                if (enabled) defaultConsole.log(...args);
                for (const c of attached) c.log(...args);
            },
            /**
             * Forwarding utility
             * @param {...*} args - Warning arguments
             */
            warn(...args) {
                if (enabled) defaultConsole.warn(...args);
                for (const c of attached) c.warn(...args);
            },
            /**
             * Forwarding utility (errors always logged to default console)
             * @param {...*} args - Error arguments
             */
            error(...args) {
                defaultConsole.error(...args);
                for (const c of attached) c.error(...args);
            },
        };
    }

    /**
     * Start a root component by name
     * @param {HTMLElement} container - Container to render into
     * @param {string} componentName - Component name (e.g., 'Counter', 'Basics/Counter')
     * @param {string} id - Component instance ID
     * @param {ComponentVars} vars - Initial component variables
     * @returns {Promise<import('./component.js').Component>} Component instance
     */
    async start(container, componentName, id, vars = {}) {
        let renderContainer = container;

        // Add app namespace to root container (first call only).
        // Create a child element so app-level classes (fusewire, appName) and
        // component-level class (fusewire-component-X) live on separate DOM
        // elements. CSS scoping uses descendant selectors that require nesting.
        if (!this._rootContainer) {
            this._rootContainer = container;
            container.classList.add('fusewire', this._appName);
            renderContainer = container.ownerDocument.createElement('div');
            container.appendChild(renderContainer);
        }

        // Wrap user's app in FuseWire/Root which provides the default PortalHost
        const appRef = new Child(componentName, id, vars);
        const portalRef = new Child('FuseWire/PortalHost', 'default');
        const rootRef = new Child('FuseWire/Root', 'root', {
            app: appRef,
            portal: portalRef,
        });

        // Consume the root route segment from the router (if configured).
        // This passes URL state to the root component's init() so it can
        // set vars from the URL before the first render (no flash).
        let routeSegment = null;
        if (this.router) {
            routeSegment = this.router.consumeRootSegment();
        }

        // Create the root wrapper (which creates app + default portal as children)
        const rootInstance = await this._instanceRegistry.createFromReference(
            rootRef,
            renderContainer,
            { routeSegment },
        );

        // Mark initial load as complete so the router stops consuming segments
        if (this.router) {
            this.router.completeInitialLoad();
            // Snapshot the full tree state into the URL (replaceState, no new entry).
            // Children mounted during init() may have routeState() values that
            // weren't in the original URL — this ensures the URL reflects reality
            // so that browser-back always has a complete snapshot to restore from.
            this.router.replaceUrl();
        }

        // Ensure reactor is attached (also set by create() if registry has reactor ref)
        rootInstance[REACTOR] = this;

        // Return the user's app instance (Root is transparent).
        // Root.app starts as a Child reference but the framework replaces it
        // with the real Component during mount — safe to cast.
        return /** @type {import('./component.js').Component} */ (
            /** @type {import('./component.js').Root} */ (rootInstance).app
        );
    }

    /**
     * Register a PortalHost so PortalChild instances can find it by ID.
     * Drains any pending requests waiting for this host.
     * Called by PortalHost.init().
     * @param {string} id - Unique portal host identifier
     * @param {import('./component.js').PortalHost} host - The PortalHost instance
     */
    registerPortalHost(id, host) {
        this._portalHosts.set(id, host);
        const pending = this._pendingPortalRequests.get(id);
        if (pending) {
            for (const { resolve } of pending) resolve(host);
            this._pendingPortalRequests.delete(id);
        }
    }

    /**
     * Unregister a PortalHost. Called by PortalHost.destroy().
     * @param {string} id - Portal host identifier to remove
     */
    unregisterPortalHost(id) {
        this._portalHosts.delete(id);
    }

    /**
     * Get a PortalHost by ID, waiting for it if not yet registered.
     * Returns a Promise that resolves when the host registers itself.
     * @param {string} id - Portal host identifier
     * @returns {Promise<import('./component.js').PortalHost>} The PortalHost instance
     */
    getPortalHost(id) {
        const host = this._portalHosts.get(id);
        if (host) return Promise.resolve(host);

        return new Promise((resolve) => {
            const list = this._pendingPortalRequests.get(id) || [];
            list.push({ resolve });
            this._pendingPortalRequests.set(id, list);
        });
    }

    /**
     * Get a PortalHost by ID synchronously.
     * Used in destroy paths where the host must exist.
     * @param {string} id - Portal host identifier
     * @returns {import('./component.js').PortalHost|undefined} The PortalHost instance
     */
    getPortalHostSync(id) {
        return this._portalHosts.get(id);
    }

    /**
     * Enqueue a component re-render.
     * The render executes asynchronously via the internal render queue, which
     * serializes all renders so only one render chain runs at a time.
     * Multiple react() calls for the same component are deduplicated — if the
     * component is already queued, subsequent calls are dropped (the queued
     * render will use the latest vars when it runs).
     * @param {ComponentId|string} componentId - Component to re-render (ComponentId or code string)
     * @param {string} mode - Render mode (currently only 'CSR' supported)
     * @returns {Promise<void>} Resolves when the current queue drain completes
     */
    react(componentId, mode = 'CSR') {
        if (mode !== 'CSR') {
            throw new Error(`Reactor: Unsupported render mode "${mode}"`);
        }

        // Accept both ComponentId and code string (from legacy callers)
        const id =
            typeof componentId === 'string' ? ComponentId.fromCode(componentId) : componentId;

        // Deduplicate: skip if this component is already waiting in the queue
        const code = id.code;
        if (!this._queue.has(code)) {
            this._queue.set(code, { id, mode });
        }

        // Start draining if not already running. We schedule it as a microtask
        // to prevent nested rendering if react() is called synchronously inside
        // a lifecycle hook or event handler executed during an ongoing render.
        if (!this._draining) {
            this._draining = true; // reserve it synchronously
            this._drainPromise = Promise.resolve().then(() => this._drain());
        }
        return this._drainPromise;
    }

    /**
     * Process the render queue sequentially until empty.
     * For each entry: render the component, then call afterRender().
     * If afterRender() (or any code during the render) enqueues more entries,
     * they are processed in order before the drain completes.
     * @private
     * @returns {Promise<void>} Resolves when the queue is empty
     */
    async _drain() {
        try {
            while (this._queue.size > 0) {
                const [code, { id }] = this._queue.entries().next().value;
                this._queue.delete(code);
                const instance = this._instanceRegistry.get(id);
                if (!instance) {
                    const error = new ComponentNotFoundError(id.code);
                    this._console.error(`Error during re-render of ${id.code}:`, error);
                    throw error;
                }
                try {
                    instance[LIFECYCLE_ACTIVE] = 'render';
                    await this._instanceRegistry.render(id);
                    instance[LIFECYCLE_ACTIVE] = 'afterRender';
                    instance.afterRender();
                } catch (error) {
                    this._console.error(`Error during re-render of ${id.code}:`, error);
                    throw error;
                } finally {
                    instance[LIFECYCLE_ACTIVE] = null;
                }
            }
        } finally {
            this._draining = false;
        }
    }

    /**
     * Pre-fetch a component's class and template, then return a factory function.
     * The factory is a shorthand for parentComponent.createChild(name, id, vars).
     * Called by Component.load() — all loading logic lives here in the framework
     * internals, not in the Component base class.
     * @param {import('./component.js').Component} parentComponent - The component calling load()
     * @param {string} name - Component name to pre-fetch
     * @returns {Promise<function(string, ComponentVars=): (import('./component.js').Child|import('./component.js').Component)>} Factory function
     */
    async loadComponentFactory(parentComponent, name) {
        await this._instanceRegistry.preload(name);

        /**
         * Factory function for creating child instances of the pre-loaded component.
         * @param {string} id - Instance identifier
         * @param {ComponentVars} [vars] - Initial variables for the component
         * @returns {import('./component.js').Child|import('./component.js').Component} Child reference
         */
        return (id, vars) => parentComponent.createChild(name, id, vars);
    }

    /**
     * Start loading a library module from the basePath.
     * Called by component.loadLibrary() — the actual import() lives here
     * so the Component class does not need to know about basePath.
     * @param {string} name - Library name (resolved as basePath/name.js)
     * @returns {Promise<object>} Promise resolving to the module object
     */
    loadLibrary(name) {
        return import(`${this._basePath}/${name}.js`);
    }

    /**
     * Declare a library dependency for a component to be loaded in parallel.
     * @param {import('./component.js').Component} component - The component instance
     * @param {string} name - Library name
     */
    loadLibraryForComponent(component, name) {
        if (!component[LIBRARIES]) component[LIBRARIES] = new Map();
        const promise = this.loadLibrary(name);
        component[LIBRARIES].set(name, { promise, module: null });
    }

    /**
     * Get a fully resolved library module for a component.
     * @param {import('./component.js').Component} component - The component instance
     * @param {string} name - Library name
     * @returns {Object<string, *>} The module object
     */
    getLibraryForComponent(component, name) {
        const libs = component[LIBRARIES];
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
}
