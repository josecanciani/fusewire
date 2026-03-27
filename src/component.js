import { ComponentReference } from './component-reference.js';

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{[key: string]: Scalar}} ScalarObject */
/** @typedef {Scalar|ScalarObject|Component|ComponentReference} VarValue */
/** @typedef {{[key: string]: (VarValue|Array<VarValue>)}} ComponentVars */
/** @typedef {{new(code: string, vars: ComponentVars): Component, componentName: string}} ComponentConstructor */

/**
 * Base class for all FuseWire components
 */
export class Component {
  /**
   * Component name for template resolution
   * @type {string}
   * @static
   */
  static componentName = 'Component';

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
   * @param {string} id - Instance identifier (optional)
   * @param {ComponentVars} vars - Component variables/data
   */
  constructor(id = '', vars = {}) {
    this.id = id;
    this.vars = vars;
    this.container = null; // Set by framework when mounted
    this._reactor = null; // Set by framework
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
   * Update hook - called when vars change on existing instance
   * @param {ComponentVars} _oldVars - Previous vars object
   */
  update(_oldVars) {
    // Override in subclasses
  }

  /**
   * Destroy hook - called when component instance is removed
   */
  destroy() {
    // Override in subclasses
  }

  /**
   * After render hook - called after DOM has been updated
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
   * Returns the Reactor-level console (which may be a custom implementation
   * such as a Console component, or the built-in console by default).
   * @returns {Console} Console-like object with log, warn, error methods
   */
  get console() {
    return this._reactor._console;
  }

  /**
   * Trigger re-render of this component
   * @param {string} mode - Render mode ('CSR' for client-side only)
   */
  react(mode = 'CSR') {
    if (!this._reactor) {
      throw new Error('Component: Cannot react - reactor not attached');
    }
    this._reactor.react(this.id, mode);
  }
}
