import { ComponentReference } from './component-reference.js';

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {{[key: string]: Scalar}} ScalarObject */
/** @typedef {Scalar|ScalarObject|Component|ComponentReference} VarValue */
/** @typedef {{[key: string]: (VarValue|Array<VarValue>)}} ComponentVars */
/** @typedef {{new(vars: ComponentVars): Component, componentName: string}} ComponentConstructor */

/**
 * Base class for all FuseWire components
 * @property {ComponentVars} componentVars - Component variables/data
 * @property {ComponentVars} vars - Alias for componentVars
 * @property {HTMLElement|null} componentContainer - DOM container element — set by engine when mounted
 * @property {Component|null} componentParent - Parent component instance — set by engine, null for root
 * @property {string} componentName - Component name (e.g. 'Counter') — set by engine
 * @property {string} componentId - Instance identifier (e.g. 'main') — set by engine
 * @property {string} componentVersion - Template version hash — set by engine after first render
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
    this.componentContainer = null; // Set by framework when mounted
    this.componentParent = null; // Set by framework
    this._reactor = null; // Set by framework
    this.componentName = '';
    this.componentId = '';
    this.componentVersion = '';
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
   * Returns the Reactor-level console (which may be a custom implementation
   * such as a Console component, or the built-in console by default).
   * @returns {import('./reactor.js').ConsoleLike} Console-like object with log, warn, error methods
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
    const code = this.componentId
      ? `${this.componentName}#${this.componentId}`
      : this.componentName;
    this._reactor.react(code, mode);
  }
}
