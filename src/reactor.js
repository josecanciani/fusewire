import { ComponentId } from './component-id.js';
import { ComponentReference } from './component-reference.js';
import { FuseWire } from './fusewire.js';
import { TemplateStore } from './template-store.js';
import { InstanceRegistry } from './instance.js';
import { Renderer } from './renderer.js';
import { Idiomorph } from './lib/idiomorph/idiomorph.esm.js';
import { REACTOR, LIFECYCLE_ACTIVE } from './symbols.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {{log: function(...*): void, warn: function(...*): void, error: function(...*): void}} ConsoleLike */
/** @typedef {{console?: Console, templateStore?: TemplateStore, renderer?: Renderer, morphFunction?: Function, instanceRegistry?: InstanceRegistry, basePath?: string, globalVars?: ComponentVars}} ReactorConfig */

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
            const morphFunction = config.morphFunction || Idiomorph.morph;
            this._renderer = new Renderer(morphFunction, this._appName);
        } else {
            this._renderer = config.renderer;
        }

        this._instanceRegistry =
            config.instanceRegistry ||
            new InstanceRegistry(this._renderer, this._templateStore, this._appName);

        // Give registry a reference to this reactor so auto-mounted children get _reactor
        this._instanceRegistry._reactor = this;

        // Register this reactor with FuseWire global registry
        FuseWire.register(this._appName, this);

        // Global vars — merged into every render's var context with lower priority
        // than component-local vars. Configured at construction time via config.globalVars.
        /** @type {ComponentVars} */
        this._globalVars = { ...config.globalVars };
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
     * Build a console multiplexer that forwards calls to the default console
     * and all currently attached consoles.
     * @private
     * @returns {ConsoleLike} Multiplexing console object
     */
    _buildConsoleMultiplexer() {
        const defaultConsole = this._defaultConsole;
        const attached = this._attachedConsoles;
        return {
            log(...args) {
                defaultConsole.log(...args);
                for (const c of attached) c.log(...args);
            },
            warn(...args) {
                defaultConsole.warn(...args);
                for (const c of attached) c.warn(...args);
            },
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

        const ref = new ComponentReference(componentName, id, vars);

        // Create instance via registry (resolves class, init, render, afterRender)
        const instance = await this._instanceRegistry.createFromReference(ref, renderContainer);

        // Ensure reactor is attached (also set by create() if registry has reactor ref)
        instance[REACTOR] = this;

        return instance;
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

        // Start draining if not already running
        if (!this._draining) {
            this._drainPromise = this._drain();
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
        this._draining = true;
        try {
            while (this._queue.size > 0) {
                const [code, { id }] = this._queue.entries().next().value;
                this._queue.delete(code);
                await this._instanceRegistry.render(id);
                const instance = this._instanceRegistry.get(id);
                instance[LIFECYCLE_ACTIVE] = 'afterRender';
                try {
                    instance.afterRender();
                } finally {
                    instance[LIFECYCLE_ACTIVE] = null;
                }
            }
        } finally {
            this._draining = false;
        }
    }
}
