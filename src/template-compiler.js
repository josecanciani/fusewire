import { ComponentId } from './component-id.js';

/**
 * Extract property value from an object using dot notation
 * @param {Object} data - Source object
 * @param {string} path - Property path (e.g., "user.name")
 * @returns {*} The property value, or undefined if not found
 */
function getPropertyValue(data, path) {
    if (!path) return undefined;

    // Handle negation
    const isNegated = path.startsWith('!');
    const cleanPath = isNegated ? path.slice(1) : path;

    const parts = cleanPath.split('.');
    let value = data;

    for (const part of parts) {
        if (value === null || value === undefined) {
            return undefined;
        }
        value = value[part];
    }

    return isNegated ? !value : value;
}

/**
 * Check if a value is a Component instance
 * @param {*} value
 * @returns {boolean}
 */
function isComponent(value) {
    return (
        value &&
        typeof value === 'object' &&
        value.constructor &&
        value.constructor.componentName
    );
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
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
 * Render a component as an empty mount point
 * @param {Object} component - Component instance
 * @param {ComponentId} parentId - Parent component ID
 * @returns {string} Mount point HTML
 */
function renderMountPoint(component, parentId) {
    const childId = new ComponentId(
        component.constructor.componentName,
        component.id || '',
    );
    return `<div data-fusewire-id="${childId.toCode()}" data-fusewire-parent-id="${parentId.toCode()}"></div>`;
}

/**
 * Interpolate variables in a text string
 * @param {string} text - Text with ((...)) placeholders
 * @param {Object} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @returns {string} Interpolated text
 */
function interpolateText(text, vars, componentId) {
    return text.replace(/\(\(([^)]+)\)\)/g, (match, path) => {
        path = path.trim();

        // Special case: ((this)) - placeholder for component instance reference
        if (path === 'this') {
            return `__FUSEWIRE_COMPONENT_${componentId.toCode()}__`;
        }

        const value = getPropertyValue(vars, path);

        // Handle undefined/null
        if (value === undefined || value === null) {
            return '';
        }

        // Handle Component instances - render as empty mount point
        if (isComponent(value)) {
            return renderMountPoint(value, componentId);
        }

        // Handle arrays of components
        if (Array.isArray(value) && value.length > 0 && isComponent(value[0])) {
            return value.map((comp) => renderMountPoint(comp, componentId)).join('');
        }

        // Handle regular values (escape HTML)
        return escapeHtml(String(value));
    });
}

/**
 * Process fw-if directive
 * @param {string} html - HTML template
 * @param {Object} vars - Variable data
 * @returns {string} Processed HTML
 */
function processConditionals(html, vars) {
    // Match fw-if attributes and their elements
    // Pattern: <tag fw-if="condition">content</tag>
    const regex = /<(\w+)([^>]*)\s+fw-if=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/gi;

    return html.replace(regex, (match, tag, beforeAttrs, condition, afterAttrs, content) => {
        const value = getPropertyValue(vars, condition.trim());
        
        if (!value) {
            // Condition is false, remove the element
            return '';
        }

        // Condition is true, keep element but remove fw-if attribute
        const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
        const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
        return `${openTag}${content}</${tag}>`;
    });
}

/**
 * Process fw-each directive
 * @param {string} html - HTML template
 * @param {Object} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @returns {string} Processed HTML
 */
function processLoops(html, vars, componentId) {
    // Match fw-each attributes and their elements
    // Pattern: <tag fw-each="item in items">content</tag>
    const regex = /<(\w+)([^>]*)\s+fw-each=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/gi;

    return html.replace(regex, (match, tag, beforeAttrs, loopExpr, afterAttrs, content) => {
        // Parse "item in items" syntax
        const loopMatch = loopExpr.match(/^\s*(\w+)\s+in\s+([\w.]+)\s*$/);
        if (!loopMatch) {
            console.warn(`Invalid fw-each syntax: ${loopExpr}`);
            return '';
        }

        const [, itemName, collectionPath] = loopMatch;
        const collection = getPropertyValue(vars, collectionPath);

        if (!Array.isArray(collection) || collection.length === 0) {
            return '';
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
            itemContent = processLoops(itemContent, scopedVars, componentId);
            
            // Interpolate variables
            itemContent = interpolateText(itemContent, scopedVars, componentId);

            const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
            return `${openTag}${itemContent}</${tag}>`;
        });

        return results.join('');
    });
}

/**
 * Scope CSS by prefixing selectors with a component class
 * @param {string} css - Original CSS
 * @param {string} componentName - Component name for scoping
 * @returns {string} Scoped CSS
 */
function scopeCSS(css, componentName) {
    if (!css || !css.trim()) return '';

    const scopeClass = `.fusewire-component-${componentName}`;

    // Simple scoping: prefix each selector
    // This is a basic implementation - a production version would use a proper CSS parser
    return css.replace(/([^{}]+)\{/g, (match, selector) => {
        const scoped = selector
            .split(',')
            .map((s) => `${scopeClass} ${s.trim()}`)
            .join(', ');
        return `${scoped} {`;
    });
}

/**
 * Extract the root element's class name for CSS scoping
 * @param {string} html - HTML template
 * @returns {string} Class name or 'component'
 */
function extractRootClassName(html) {
    const match = html.match(/class=["']([^"']+)["']/);
    return match ? match[1].split(' ')[0] : 'component';
}

/**
 * Add component scoping class to root element
 * @param {string} html - HTML template
 * @param {string} componentName - Component name
 * @returns {string} HTML with scoping class added
 */
function addScopingClass(html, componentName) {
    const scopeClass = `fusewire-component-${componentName}`;
    
    // Find first opening tag
    const match = html.match(/^(\s*)<(\w+)(\s+[^>]*)?(>)/);
    if (!match) return html;

    const [fullMatch, leadingSpace, tag, attrs, closingBracket] = match;
    
    // Check if class attribute exists
    const hasClass = attrs && /class=/.test(attrs);
    
    if (hasClass) {
        // Add to existing class attribute
        const withClass = attrs.replace(
            /class=(["'])([^"']*)\1/,
            `class=$1$2 ${scopeClass}$1`,
        );
        return html.replace(fullMatch, `${leadingSpace}<${tag}${withClass}${closingBracket}`);
    } else {
        // Add new class attribute
        const newAttrs = (attrs || '') + ` class="${scopeClass}"`;
        return html.replace(fullMatch, `${leadingSpace}<${tag}${newAttrs}${closingBracket}`);
    }
}

/**
 * Compile a template into a render function
 * @param {string} htmlCode - HTML template code
 * @param {string} cssCode - CSS code (optional)
 * @returns {Object} Compiled template with render function and scoped CSS
 */
export function compileTemplate(htmlCode, cssCode = '') {
    // Extract root class name for CSS scoping
    const rootClassName = extractRootClassName(htmlCode);

    return {
        /**
         * Render the template with given variables
         * @param {Object} vars - Component variables
         * @param {ComponentId} componentId - Component instance ID
         * @returns {string} Rendered HTML
         */
        render(vars, componentId) {
            if (!htmlCode || !htmlCode.trim()) {
                return '';
            }

            let html = htmlCode.trim();

            // Process directives (order matters!)
            // 1. Process conditionals first (removes branches)
            html = processConditionals(html, vars);

            // 2. Process loops (expands repeated elements)
            html = processLoops(html, vars, componentId);

            // 3. Interpolate variables (fills in values)
            html = interpolateText(html, vars, componentId);

            // 4. Add component scoping class
            html = addScopingClass(html, componentId.name);

            return html;
        },

        /**
         * Get scoped CSS
         */
        get css() {
            return scopeCSS(cssCode, rootClassName);
        },
    };
}
