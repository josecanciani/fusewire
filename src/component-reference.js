import { ComponentId } from './component-id.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */

/**
 * ComponentReference - A lightweight declaration of a child component.
 *
 * This is NOT a Component instance. It carries only the data needed for
 * the InstanceRegistry to create the real Component: name, id, vars, and
 * an optional version for cache validation.
 *
 * Developers create references via Component.createChild() inside component
 * code. The InstanceRegistry recognises these in vars and auto-mounts the
 * real Component at render time.
 *
 * @example
 * // Inside a component method:
 * this.vars.sidebar = this.createChild('Sidebar', 'main', { collapsed: false });
 * this.react();
 */
export class ComponentReference {
  /**
   * Create a new ComponentReference
   * @param {string} componentName - Component name for template/class resolution
   * @param {string} id - Instance identifier (may be empty)
   * @param {ComponentVars} vars - Initial variables for the component
   * @param {string|null} version - Template version hash, or null for latest
   */
  constructor(componentName, id = '', vars = {}, version = null) {
    if (!componentName || typeof componentName !== 'string') {
      throw new Error('ComponentReference: componentName must be a non-empty string');
    }
    this.componentName = componentName;
    this.id = id;
    this.vars = vars;
    this.version = version;
  }

  /**
   * Build a ComponentId from this reference
   * @returns {ComponentId} The corresponding ComponentId
   */
  toComponentId() {
    return new ComponentId(this.componentName, this.id);
  }
}
