import { findChildMountPoints } from './utils/dom-helpers.js';
import { toCssName } from './component-id.js';

/** @typedef {import('./template-compiler.js').CompiledTemplate} CompiledTemplate */
/** @typedef {import('./template-compiler.js').TemplateConstants} TemplateConstants */
/** @typedef {import('./component.js').ComponentVars} ComponentVars */

/**
 * Renderer - Applies compiled templates to DOM using morphing
 */
export class Renderer {
  /**
   * Create a new Renderer
   * @param {Function} morphFunction - DOM morphing function (e.g., Idiomorph.morph)
   * @param {string} appName - Application name for CSS scoping
   */
  constructor(morphFunction, appName = 'default') {
    this.morphFunction = morphFunction;
    this._appName = appName;
    this._injectedCSS = new Set(); // Track which components have CSS injected
  }

  /**
   * Render a component to a container
   * @param {HTMLElement} container - Container to render into
   * @param {CompiledTemplate} compiledTemplate - Compiled template with render() and css
   * @param {ComponentVars} vars - Component variables
   * @param {import('./component-id.js').ComponentId} componentId - Component identifier
   * @param {TemplateConstants} constants - Template constants (version, etc.)
   * @returns {HTMLElement[]} Array of child mount point elements
   */
  render(container, compiledTemplate, vars, componentId, constants = {}) {
    // 1. Generate HTML string from template + vars + constants
    const htmlString = compiledTemplate.render(vars, componentId, constants);

    // 2. Morph DOM (or set innerHTML on first render)
    if (container.children.length === 0) {
      // First render - just set innerHTML (no morph needed)
      container.innerHTML = htmlString;
    } else {
      // Re-render - use morphing to preserve unchanged nodes
      this.morphFunction(container, htmlString, {
        morphStyle: 'innerHTML',
      });
    }

    // 3. Inject CSS if not already present
    this._injectCSS(componentId.name, compiledTemplate.css);

    // 4. Find and return child mount points
    return findChildMountPoints(container, componentId);
  }

  /**
   * Inject scoped CSS for a component (once per component name)
   * @private
   * @param {string} componentName - Component name
   * @param {string} rawCss - Raw CSS code (unscoped)
   */
  _injectCSS(componentName, rawCss) {
    if (!rawCss || this._injectedCSS.has(componentName)) {
      return; // No CSS or already injected
    }

    const cssName = toCssName(componentName);
    const styleId = `fusewire-style-${this._appName}-${cssName}`;
    if (document.getElementById(styleId)) {
      return; // Already injected by another instance
    }

    const scopedCss = this._scopeCSS(rawCss, cssName);

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = scopedCss;
    document.head.appendChild(styleEl);

    this._injectedCSS.add(componentName);
  }

  /**
   * Scope CSS by prefixing selectors with app name and component class
   * @private
   * @param {string} css - Raw CSS
   * @param {string} cssName - CSS-safe component name (already sanitized via toCssName)
   * @returns {string} Scoped CSS
   */
  _scopeCSS(css, cssName) {
    if (!css || !css.trim()) return '';

    return `.${this._appName} {\n  .fusewire-component-${cssName} {\n    ${css.trim()}\n  }\n}`;
  }
}
