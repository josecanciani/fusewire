import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { ComponentId, toCssName } from './component-id.js';
import { ComponentReference } from './component-reference.js';
import { Component } from './component.js';
import { compileTemplate } from './template-compiler.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {import('./component.js').VarValue} VarValue */
/** @typedef {import('./component.js').ComponentConstructor} ComponentConstructor */

/**
 * InstanceRegistry manages component instances and their lifecycle.
 *
 * Responsibilities:
 * - Create/update/remove component instances
 * - Call lifecycle hooks (hydrate, update, destroy)
 * - Coordinate rendering with Renderer
 * - Manage component tree (parent/child relationships)
 * - Resolve ComponentReference declarations to real Component instances
 */
export class InstanceRegistry {
  constructor(renderer, templateStore, appName = 'default') {
    this._renderer = renderer;
    this._templateStore = templateStore;
    this._appName = appName;
    this._reactor = null; // Set by Reactor after construction
    this._instances = new Map(); // componentId.toCode() -> { instance, container, children }
    this._componentClasses = new Map(); // componentName -> ComponentConstructor (pre-registered)
  }

  /**
   * Pre-register a component class for name-based resolution.
   * Used in tests and when dynamic import() is not available.
   * @param {string} name - Component name
   * @param {ComponentConstructor} ComponentClass - The component class constructor
   */
  registerComponent(name, ComponentClass) {
    Object.defineProperty(ComponentClass, 'componentName', { value: name, configurable: true });
    this._componentClasses.set(name, ComponentClass);
  }

  /**
   * Create a component from a ComponentReference (resolves the class by name)
   * @param {ComponentReference} ref - Component reference to resolve
   * @param {HTMLElement} container - DOM container
   * @returns {Promise<Component>} The created instance
   */
  async createFromReference(ref, container) {
    const ComponentClass = await this._loadComponentClass(ref.componentName);
    const componentId = ref.toComponentId();
    return await this.create(componentId, ComponentClass, { ...ref.vars }, container);
  }

  /**
   * Create a new component instance
   * @param {ComponentId} componentId - Component identifier
   * @param {ComponentConstructor} ComponentClass - Component class constructor
   * @param {ComponentVars} vars - Initial vars
   * @param {HTMLElement} container - DOM container
   * @returns {Promise<Component>} The created instance
   */
  async create(componentId, ComponentClass, vars, container) {
    const code = componentId.toCode();
    if (this._instances.has(code)) {
      throw new Error(`Component ${code} already exists in registry`);
    }

    // Add component scope class to container
    container.classList.add(`fusewire-component-${toCssName(componentId.name)}`);

    const instance = new ComponentClass(vars);
    instance.componentName = componentId.name;
    instance.componentId = componentId.id;
    instance.componentContainer = container;

    // Attach reactor if available (enables this.react() on the instance)
    if (this._reactor) {
      instance._reactor = this._reactor;
    }

    // Call hydrate hook
    await instance.hydrate();

    // Store instance and container
    this._instances.set(code, { instance, container });

    // Initial render
    await this.render(componentId);

    // Call afterRender hook
    instance.afterRender();

    return instance;
  }

  /**
   * Get an existing instance
   * @param {ComponentId|string} componentId - Component identifier or code string (e.g., "Counter#main" or "Counter")
   * @returns {Component|null} The component instance or null if not found
   */
  get(componentId) {
    const code = typeof componentId === 'string' ? componentId : componentId.toCode();
    const entry = this._instances.get(code);
    return entry ? entry.instance : null;
  }

  /**
   * Update an existing instance with new vars (server-side flow).
   * Uses Component.update() with react=false because this method
   * handles rendering explicitly.
   * @param {ComponentId} componentId - Component identifier
   * @param {ComponentVars} newVars - New variable values to merge
   */
  async update(componentId, newVars) {
    const code = componentId.toCode();
    const entry = this._instances.get(code);

    if (!entry) {
      throw new ComponentNotFoundError(code);
    }

    const { instance } = entry;

    // Merge vars without triggering react — we handle rendering below
    instance.update(newVars, false);

    // Re-render
    await this.render(componentId);

    // Call afterRender hook
    instance.afterRender();
  }

  /**
   * Remove instance and clean up (cascades to children)
   * @param {ComponentId} componentId - Component identifier
   */
  async remove(componentId) {
    const code = componentId.toCode();
    const entry = this._instances.get(code);

    if (!entry) {
      return; // Silently ignore non-existent instances
    }

    // Recursively remove children first
    if (entry.children) {
      for (const [, childId] of entry.children) {
        await this.remove(childId);
      }
    }

    const { instance, container } = entry;

    // Call destroy hook
    await instance.destroy();

    // Remove from DOM
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }

    // Remove from registry
    this._instances.delete(code);
  }

  /**
   * Render a component instance to its container
   * @param {ComponentId} componentId - Component identifier
   */
  async render(componentId) {
    const code = componentId.toCode();
    const entry = this._instances.get(code);

    if (!entry) {
      throw new ComponentNotFoundError(code);
    }

    const { instance, container } = entry;
    const componentName = instance.componentName;

    // Lazy-load template from basePath if not already in store
    if (!this._templateStore.has(componentName) && this._reactor) {
      await this._templateStore.fetch(componentName, this._reactor._basePath);
    }

    // Get template from store
    const template = this._templateStore.get(componentName);
    if (!template) {
      throw new Error(`Template not found for component ${componentName}`);
    }

    // Update version on instance
    instance.componentVersion = template.version || '';

    // Get or compile template
    let compiled = this._templateStore.getCompiled(componentName);
    if (!compiled) {
      compiled = compileTemplate(template.htmlCode || '', template.cssCode || '', this._appName);
      this._templateStore.setCompiled(componentName, compiled);
    }

    // Snapshot current child declarations from vars before rendering
    const currentChildren = this._collectChildComponents(instance.componentVars);

    // Build template constants
    const constants = { version: template.version || '' };

    // Render to DOM and find child mount points
    const mountPoints = this._renderer.render(
      container,
      compiled,
      instance.componentVars,
      componentId,
      constants,
    );

    // Auto-mount child components found in mount points
    for (const mountPoint of mountPoints) {
      await this._mountChild(mountPoint, instance);
    }

    // Remove orphaned children (present in previous vars but not current)
    const previousChildren = entry.children || new Map();
    for (const [childCode, childId] of previousChildren) {
      if (!currentChildren.has(childCode) && this.has(childId)) {
        await this.remove(childId);
      }
    }

    // Track current children for next render cycle
    entry.children = currentChildren;
  }

  /**
   * Auto-mount a child component into its mount point
   * @private
   * @param {HTMLElement} mountPoint - Mount point element with data-fusewire-id
   * @param {Component} parentInstance - Parent component instance
   */
  async _mountChild(mountPoint, parentInstance) {
    const childCode = mountPoint.getAttribute('data-fusewire-id');
    if (!childCode) return;

    let childId;
    try {
      childId = ComponentId.fromCode(childCode);
    } catch {
      return;
    }

    if (this.has(childId)) {
      // Child already exists — update container reference (morphing may replace elements)
      const entry = this._instances.get(childId.toCode());
      entry.container = mountPoint;
      entry.instance.componentContainer = mountPoint;
      mountPoint.classList.add(`fusewire-component-${toCssName(childId.name)}`);
      await this.render(childId);
      return;
    }

    // Find matching child declaration in parent's vars
    const decl = this._findChildDeclaration(parentInstance.componentVars, childId);
    if (!decl) return;

    // Create and render the child (template will be lazy-loaded during render).
    // Catch errors so a missing child template doesn't crash the parent.
    try {
      let childInstance;
      if (decl instanceof ComponentReference) {
        childInstance = await this.createFromReference(decl, mountPoint);
        // Replace the transient ComponentReference with the real Component in the
        // parent's vars. From this point on, parent code that accesses the var
        // (e.g. this.vars.logs.at(-1)) gets the Component directly and can call
        // update() on it. The old reference is marked as replaced so that any
        // stale usage throws.
        this._replaceRefInVars(parentInstance.componentVars, decl, childInstance);
        decl._replaced = true;
      } else {
        // Legacy: Component instance used as declaration
        childInstance = await this.create(
          childId,
          /** @type {ComponentConstructor} */ (decl.constructor),
          { ...decl.componentVars },
          mountPoint,
        );
        // Link declaration to reactor so it can trigger re-renders via react()
        decl._reactor = this._reactor;
        decl.componentName = childId.name;
        decl.componentId = childId.id;
      }
      childInstance.componentParent = parentInstance;
    } catch {
      // Clean up partially-created instance if render failed
      this._instances.delete(childId.toCode());
    }
  }

  /**
   * Search component vars for a child component declaration matching the given ID
   * @private
   * @param {ComponentVars} vars - Parent component variables
   * @param {ComponentId} childId - Child component ID to match
   * @returns {Component|ComponentReference|null} Matching declaration or null
   */
  _findChildDeclaration(vars, childId) {
    for (const value of Object.values(vars)) {
      if (this._matchesChildId(value, childId)) {
        return /** @type {Component|ComponentReference} */ (value);
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this._matchesChildId(item, childId)) {
            return /** @type {Component|ComponentReference} */ (item);
          }
        }
      }
    }
    return null;
  }

  /**
   * Check if a value is a component declaration matching the given ID
   * @private
   * @param {VarValue|Array<VarValue>} value - Value to check
   * @param {ComponentId} childId - Expected component ID
   * @returns {boolean} True if value matches
   */
  _matchesChildId(value, childId) {
    if (value instanceof ComponentReference) {
      return value.componentName === childId.name && (value.id || '') === childId.id;
    }
    // Legacy: Component instance
    const decl = /** @type {Component} */ (value);
    return (
      decl &&
      typeof decl === 'object' &&
      /** @type {ComponentConstructor} */ (decl.constructor).componentName === childId.name &&
      (decl.componentId || '') === childId.id
    );
  }

  /**
   * Check if instance exists
   * @param {ComponentId} componentId - Component identifier
   * @returns {boolean} True if instance exists in registry
   */
  has(componentId) {
    return this._instances.has(componentId.toCode());
  }

  /**
   * Get container element for an instance
   * @param {ComponentId} componentId - Component identifier
   * @returns {HTMLElement|null} Container element or null if not found
   */
  getContainer(componentId) {
    const entry = this._instances.get(componentId.toCode());
    return entry ? entry.container : null;
  }

  /**
   * Clear all instances (for cleanup/testing)
   */
  async clearAll() {
    const codes = Array.from(this._instances.keys());
    for (const code of codes) {
      const componentId = ComponentId.fromCode(code);
      await this.remove(componentId);
    }
  }

  /**
   * Load a component class by name.
   * Checks pre-registered classes first, then falls back to dynamic import.
   * @private
   * @param {string} componentName - Component name (e.g., 'Counter', 'Basics/Counter')
   * @returns {Promise<ComponentConstructor>} The component class constructor
   */
  async _loadComponentClass(componentName) {
    if (this._componentClasses.has(componentName)) {
      return this._componentClasses.get(componentName);
    }

    if (!this._reactor) {
      throw new Error(
        `Cannot load component "${componentName}": no reactor attached and class not pre-registered`,
      );
    }

    const basePath = this._reactor._basePath;
    const module = await import(`${basePath}/${componentName}.js`);

    // Try named export matching the simple name, then the full name, then default
    const simpleName = componentName.includes('/') ? componentName.split('/').pop() : componentName;
    const ComponentClass = module[simpleName] || module[componentName] || module.default;

    if (!ComponentClass || typeof ComponentClass !== 'function') {
      throw new Error(
        `Component class "${componentName}" not found in ${basePath}/${componentName}.js`,
      );
    }

    // Set the canonical component name on the class
    Object.defineProperty(ComponentClass, 'componentName', {
      value: componentName,
      configurable: true,
    });

    // Cache for future use
    this._componentClasses.set(componentName, ComponentClass);
    return ComponentClass;
  }

  /**
   * Collect component declarations from vars (top-level values and array items).
   * Recognises both ComponentReference and legacy Component instances.
   * Vars follow a flat structure: scalar, plain object, Component/ComponentReference,
   * or Array of those. Plain objects cannot contain components, so only top-level
   * and array scanning is needed.
   * @private
   * @param {ComponentVars} vars - Component variables
   * @returns {Map<string, ComponentId>} Map of component code to ComponentId
   */
  _collectChildComponents(vars) {
    const children = new Map();
    for (const value of Object.values(vars)) {
      this._collectIfComponent(/** @type {VarValue} */ (value), children);
      if (Array.isArray(value)) {
        for (const item of value) {
          this._collectIfComponent(item, children);
        }
      }
    }
    return children;
  }

  /**
   * If value is a component declaration, add its identity to the children map
   * @private
   * @param {VarValue} value - Value to check
   * @param {Map<string, ComponentId>} children - Map to add to
   */
  _collectIfComponent(value, children) {
    if (!this._isComponentDecl(value)) return;
    let name;
    let id;
    if (value instanceof ComponentReference) {
      name = value.componentName;
      id = value.id || '';
    } else {
      const decl = /** @type {Component} */ (value);
      name = /** @type {ComponentConstructor} */ (decl.constructor).componentName;
      id = decl.componentId || '';
    }
    const componentId = new ComponentId(name, id);
    children.set(componentId.toCode(), componentId);
  }

  /**
   * Check if a value is a component declaration (ComponentReference or Component instance)
   * @private
   * @param {VarValue|Array<VarValue>} value - Value to check
   * @returns {boolean} True if value is a component declaration
   */
  _isComponentDecl(value) {
    return value instanceof ComponentReference || value instanceof Component;
  }

  /**
   * Replace a ComponentReference with the real Component instance in the parent's vars.
   * Searches top-level values and array items by identity (===).
   * @private
   * @param {ComponentVars} vars - Parent component variables
   * @param {ComponentReference} ref - The reference to replace
   * @param {Component} instance - The real Component instance
   */
  _replaceRefInVars(vars, ref, instance) {
    for (const [key, value] of Object.entries(vars)) {
      if (value === ref) {
        vars[key] = instance;
        return;
      }
      if (Array.isArray(value)) {
        const idx = value.indexOf(ref);
        if (idx !== -1) {
          value[idx] = instance;
          return;
        }
      }
    }
  }
}
