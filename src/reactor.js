import { ComponentId } from './component-id.js';
import { FuseWire } from './fusewire.js';
import { TemplateStore } from './template-store.js';
import { InstanceRegistry } from './instance.js';
import { Renderer } from './renderer.js';
import { Idiomorph } from './lib/idiomorph/idiomorph.esm.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {{console?: Console, templateStore?: TemplateStore, renderer?: Renderer, morphFunction?: Function, instanceRegistry?: InstanceRegistry}} ReactorConfig */
/** @typedef {{loadHtml?: boolean, loadCss?: boolean, loadJs?: boolean, version?: string}} RegisterComponentOptions */

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
    this._config = config;
    this._appName = appName;

    // Auto-create dependencies if not provided
    this._templateStore = config.templateStore || new TemplateStore();

    // Renderer setup - use Idiomorph by default, allow override for tests
    if (!config.renderer) {
      const morphFunction = config.morphFunction || Idiomorph.morph;
      this._renderer = new Renderer(morphFunction);
    } else {
      this._renderer = config.renderer;
    }

    this._instanceRegistry =
      config.instanceRegistry ||
      new InstanceRegistry(this._renderer, this._templateStore, this._appName);

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
   * Register a component by loading its files
   * @param {string} basePath - Base path for component files (e.g., '/components/Counter')
   * @param {string} name - Component name (e.g., 'Counter')
   * @param {RegisterComponentOptions} opts - Options
   * @returns {Promise<{ComponentClass, htmlCode, cssCode}>} Loaded component data
   */
  async registerComponent(basePath, name, opts = {}) {
    const { loadHtml = true, loadCss = true, loadJs = true, version = 'v1' } = opts;

    const promises = [];
    let htmlCode = '';
    let cssCode = '';
    let ComponentClass = null;

    // Load HTML
    if (loadHtml) {
      promises.push(
        fetch(`${basePath}.html`)
          .then((res) => (res.ok ? res.text() : ''))
          .then((text) => {
            htmlCode = text;
          }),
      );
    }

    // Load CSS
    if (loadCss) {
      promises.push(
        fetch(`${basePath}.css`)
          .then((res) => (res.ok ? res.text() : ''))
          .then((text) => {
            cssCode = text;
          }),
      );
    }

    // Load JS module
    if (loadJs) {
      promises.push(
        import(basePath + '.js').then((module) => {
          // Find the component class (assume export { ClassName } or export default)
          ComponentClass = module[name] || module.default;
        }),
      );
    }

    await Promise.all(promises);

    // Register template
    this._templateStore.set(name, {
      version,
      htmlCode,
      cssCode,
    });

    return { ComponentClass, htmlCode, cssCode };
  }

  /**
   * Start a root component
   * @param {HTMLElement} container - Container to render into
   * @param {typeof import('./component.js').Component} ComponentClass - Component class
   * @param {string} id - Component instance ID
   * @param {ComponentVars} vars - Initial component variables
   * @returns {Promise<import('./component.js').Component>} Component instance
   */
  async start(container, ComponentClass, id, vars) {
    const componentId = new ComponentId(ComponentClass.componentName, id);

    // Create instance using registry (handles hydrate, render, afterRender)
    const instance = await this._instanceRegistry.create(
      componentId,
      ComponentClass,
      vars,
      container,
    );

    // Attach reactor to component
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

    // Re-render using registry (calls update hook and re-renders)
    await this._instanceRegistry.render(id);
  }
}
