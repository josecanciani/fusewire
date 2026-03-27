import { ComponentId } from './component-id.js';
import { ComponentReference } from './component-reference.js';
import { Component } from './component.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {import('./component.js').VarValue} VarValue */
/** @typedef {import('./component.js').ComponentConstructor} ComponentConstructor */
/** @typedef {{version?: string}} TemplateConstants */
/** @typedef {{render: function(ComponentVars, ComponentId, TemplateConstants=): string, css: string}} CompiledTemplate */

/**
 * Extract property value from an object using dot notation
 * @param {ComponentVars} data - Source object
 * @param {string} path - Property path (e.g., "user.name")
 * @returns {VarValue|Array<VarValue>|boolean|undefined} The property value, or undefined if not found
 */
function getPropertyValue(data, path) {
  if (!path) return undefined;

  // Handle negation
  const isNegated = path.startsWith('!');
  const cleanPath = isNegated ? path.slice(1) : path;

  const parts = cleanPath.split('.');
  /** @type {VarValue|Array<VarValue>|ComponentVars|undefined} */
  let value = data;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = /** @type {VarValue|Array<VarValue>|ComponentVars|undefined} */ (
      /** @type {ComponentVars} */ (value)[part]
    );
  }

  return isNegated ? !value : /** @type {VarValue|Array<VarValue>|undefined} */ (value);
}

/**
 * Check if a value is a Component instance or ComponentReference
 * @param {VarValue|Array<VarValue>} value - Value to check
 * @returns {boolean} True if value represents a component
 */
function isComponent(value) {
  return value instanceof ComponentReference || value instanceof Component;
}

/**
 * Find the position of the matching closing tag, accounting for nesting.
 * Handles same-tag nesting correctly (e.g., div inside div).
 * @param {string} html - HTML string to search in
 * @param {string} tagName - Tag name to match (e.g., "div")
 * @param {number} startIndex - Position after the opening tag's closing bracket
 * @returns {number} Position of the matching closing tag's `<`, or -1 if not found
 */
function findMatchingClose(html, tagName, startIndex) {
  const lowerHtml = html.toLowerCase();
  const lowerTag = tagName.toLowerCase();
  const closeTag = `</${lowerTag}>`;
  const openTag = `<${lowerTag}`;
  let depth = 1;
  let i = startIndex;

  while (i < lowerHtml.length && depth > 0) {
    const nextAngle = lowerHtml.indexOf('<', i);
    if (nextAngle === -1) break;

    // Check for closing tag: </tagName>
    if (lowerHtml.startsWith(closeTag, nextAngle)) {
      depth--;
      if (depth === 0) return nextAngle;
      i = nextAngle + closeTag.length;
      continue;
    }

    // Check for opening tag: <tagName followed by whitespace, >, or /
    if (lowerHtml.startsWith(openTag, nextAngle)) {
      const charAfter = lowerHtml[nextAngle + openTag.length];
      if (/[\s>/]/.test(charAfter || '')) {
        // Skip self-closing tags (end with />)
        const endBracket = lowerHtml.indexOf('>', nextAngle);
        if (endBracket !== -1 && lowerHtml[endBracket - 1] !== '/') {
          depth++;
        }
        i = endBracket !== -1 ? endBracket + 1 : nextAngle + 1;
        continue;
      }
    }

    i = nextAngle + 1;
  }

  return -1;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML output
 */
function escapeHtml(str) {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = str;
    return div.innerHTML;
  }
  // Fallback for Node environment
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a component declaration as an empty mount point
 * @param {Component|ComponentReference} decl - Component instance or ComponentReference
 * @param {ComponentId} parentId - Parent component ID
 * @returns {string} Mount point HTML
 */
function renderMountPoint(decl, parentId) {
  let name;
  let id;
  if (decl instanceof ComponentReference) {
    name = decl.componentName;
    id = decl.id || '';
  } else {
    name = /** @type {ComponentConstructor} */ (decl.constructor).componentName;
    id = decl.componentId || '';
  }
  const childId = new ComponentId(name, id);
  return `<div data-fusewire-id="${childId.toCode()}" data-fusewire-parent-id="${parentId.toCode()}"></div>`;
}

/**
 * Interpolate variables in a text string
 * @param {string} text - Text with ((...)) placeholders
 * @param {ComponentVars} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @param {TemplateConstants} constants - Template constants (version, etc.)
 * @returns {string} Interpolated text
 */
function interpolateText(text, vars, componentId, constants) {
  return text.replace(/\(\(([^)]+)\)\)/g, (match, path) => {
    path = path.trim();

    // Special case: ((this)) - placeholder for component instance reference
    if (path === 'this') {
      // Replace # with _ to make it a valid JS identifier
      const safeCode = componentId.toCode().replace(/#/g, '_');
      return `__FUSEWIRE_COMPONENT_${safeCode}__`;
    }

    // Template constants (not part of mutable vars)
    if (path === 'componentId') return escapeHtml(componentId.toCode());
    if (path === 'componentName') return escapeHtml(componentId.name);
    if (path === 'componentVersion') return escapeHtml(constants.version || '');

    const value = getPropertyValue(vars, path);

    // Handle undefined/null
    if (value === undefined || value === null) {
      return '';
    }

    // Handle Component instances - render as empty mount point
    if (isComponent(value)) {
      return renderMountPoint(/** @type {Component|ComponentReference} */ (value), componentId);
    }

    // Handle arrays of components - wrap in reconciliation container
    if (Array.isArray(value) && value.length > 0 && isComponent(value[0])) {
      const mountPoints = value
        .map((comp) =>
          renderMountPoint(/** @type {Component|ComponentReference} */ (comp), componentId),
        )
        .join('');
      return `<div data-fusewire-each="${escapeHtml(path)}">${mountPoints}</div>`;
    }

    // Handle regular values (escape HTML)
    return escapeHtml(String(value));
  });
}

/**
 * Process fw-if directive with nesting-aware tag matching
 * @param {string} html - HTML template
 * @param {ComponentVars} vars - Variable data
 * @returns {string} Processed HTML
 */
function processConditionals(html, vars) {
  const openRegex = /<(\w+)([^>]*)\s+fw-if=["']([^"']+)["']([^>]*)>/i;
  let result = html;
  let match;

  while ((match = openRegex.exec(result)) !== null) {
    const [fullMatch, tag, beforeAttrs, condition, afterAttrs] = match;
    const contentStart = match.index + fullMatch.length;

    const closeIndex = findMatchingClose(result, tag, contentStart);
    if (closeIndex === -1) break;

    const content = result.substring(contentStart, closeIndex);
    const closeTag = `</${tag}>`;
    const elementEnd = closeIndex + closeTag.length;

    const value = getPropertyValue(vars, condition.trim());

    let replacement;
    if (!value) {
      replacement = '';
    } else {
      const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
      const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
      replacement = `${openTag}${content}${closeTag}`;
    }

    result = result.substring(0, match.index) + replacement + result.substring(elementEnd);
  }

  return result;
}

/**
 * Process fw-each directive with nesting-aware tag matching
 * @param {string} html - HTML template
 * @param {ComponentVars} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @param {TemplateConstants} constants - Template constants
 * @returns {string} Processed HTML
 */
function processLoops(html, vars, componentId, constants) {
  const openRegex = /<(\w+)([^>]*)\s+fw-each=["']([^"']+)["']([^>]*)>/i;
  let result = html;
  let match;

  while ((match = openRegex.exec(result)) !== null) {
    const [fullMatch, tag, beforeAttrs, loopExpr, afterAttrs] = match;
    const contentStart = match.index + fullMatch.length;

    const closeIndex = findMatchingClose(result, tag, contentStart);
    if (closeIndex === -1) break;

    const content = result.substring(contentStart, closeIndex);
    const closeTag = `</${tag}>`;
    const elementEnd = closeIndex + closeTag.length;

    // Parse "item in items" syntax
    const loopMatch = loopExpr.match(/^\s*(\w+)\s+in\s+([\w.]+)\s*$/);
    if (!loopMatch) {
      console.warn(`Invalid fw-each syntax: ${loopExpr}`);
      result = result.substring(0, match.index) + result.substring(elementEnd);
      continue;
    }

    const [, itemName, collectionPath] = loopMatch;
    const collection = getPropertyValue(vars, collectionPath);

    if (!Array.isArray(collection) || collection.length === 0) {
      result = result.substring(0, match.index) + result.substring(elementEnd);
      continue;
    }

    // Render the element for each item
    const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
    const results = collection.map((item) => {
      // Create scoped vars with loop item
      const scopedVars = { ...vars, [itemName]: item };

      // Process the content with scoped vars
      let itemContent = content;

      // Recursively process nested conditionals and loops
      itemContent = processConditionals(itemContent, scopedVars);
      itemContent = processLoops(itemContent, scopedVars, componentId, constants);

      // Interpolate variables in content and element attributes
      itemContent = interpolateText(itemContent, scopedVars, componentId, constants);
      const itemAttrs = attrs ? interpolateText(attrs, scopedVars, componentId, constants) : '';

      const openTag = itemAttrs ? `<${tag} ${itemAttrs}>` : `<${tag}>`;
      return `${openTag}${itemContent}${closeTag}`;
    });

    const replacement = results.join('');
    result = result.substring(0, match.index) + replacement + result.substring(elementEnd);
  }

  return result;
}

/**
 * Compile a template into a render function
 * @param {string} htmlCode - HTML template code
 * @param {string} cssCode - CSS code (optional)
 * @param {string} appName - Application name for FuseWire.get() calls
 * @returns {CompiledTemplate} Compiled template with render function and raw CSS
 */
export function compileTemplate(htmlCode, cssCode = '', appName = 'default') {
  return {
    /**
     * Render the template with given variables
     * @param {ComponentVars} vars - Component variables
     * @param {ComponentId} componentId - Component instance ID
     * @param {TemplateConstants} constants - Template constants (version, etc.)
     * @returns {string} Rendered HTML
     */
    render(vars, componentId, constants = {}) {
      if (!htmlCode || !htmlCode.trim()) {
        return '';
      }

      let html = htmlCode.trim();

      // Process directives (order matters!)
      // 1. Process conditionals first (removes branches)
      html = processConditionals(html, vars);

      // 2. Process loops (expands repeated elements)
      html = processLoops(html, vars, componentId, constants);

      // 3. Interpolate variables (fills in values)
      html = interpolateText(html, vars, componentId, constants);

      // 4. Replace ((this)) placeholders with FuseWire.get() calls
      html = html.replace(
        /__FUSEWIRE_COMPONENT_([^_]+)_([^_]+)__/g,
        (match, componentName, instanceId) => {
          // Convert back: Console_main -> Console#main
          const code = `${componentName}#${instanceId}`;
          return `FuseWire.get('${appName}', '${code}')`;
        },
      );

      return html;
    },

    /**
     * Get raw CSS (scoping is applied by Renderer at injection time)
     * @returns {string} Raw CSS string
     */
    get css() {
      return cssCode || '';
    },
  };
}
