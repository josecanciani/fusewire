import { ComponentId } from './component-id.js';
import { ComponentReference } from './component-reference.js';
import { FuseWire } from './fusewire.js';
import { TemplateStore } from './template-store.js';
import { InstanceRegistry } from './instance.js';
import { Renderer } from './renderer.js';
import { Idiomorph } from './lib/idiomorph/idiomorph.esm.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {{log: function(...*): void, warn: function(...*): void, error: function(...*): void}} ConsoleLike */
/** @typedef {{console?: Console, templateStore?: TemplateStore, renderer?: Renderer, morphFunction?: Function, instanceRegistry?: InstanceRegistry, basePath?: string}} ReactorConfig */

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
    // Add app namespace to root container (first call only)
    if (!this._rootContainer) {
      this._rootContainer = container;
      container.classList.add('fusewire', this._appName);
    }

    const ref = new ComponentReference(componentName, id, vars);

    // Create instance via registry (resolves class, hydrate, render, afterRender)
    const instance = await this._instanceRegistry.createFromReference(ref, container);

    // Ensure reactor is attached (also set by create() if registry has reactor ref)
    instance._reactor = this;

    return instance;
  }

  /**
   * Trigger re-render of a component
   * @param {ComponentId|string} componentId - Component to re-render (ComponentId or code string)
   * @param {string} mode - Render mode (currently only 'CSR' supported)
   */
  async react(componentId, mode = 'CSR') {
    if (mode !== 'CSR') {
      throw new Error(`Reactor: Unsupported render mode "${mode}"`);
    }

    // Convert string to ComponentId if needed
    const id = typeof componentId === 'string' ? ComponentId.fromCode(componentId) : componentId;

    // Re-render and call afterRender hook
    await this._instanceRegistry.render(id);
    const instance = this._instanceRegistry.get(id);
    if (instance) instance.afterRender();
  }
}
