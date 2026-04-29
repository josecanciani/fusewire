import { ComponentId } from './component-id.js';
import { Child } from './component.js';
import { Component } from './component.js';
import { DIRECTIVE_REGEX, INTERPOLATION_REGEX, findMatchingClose } from './template-parser.js';
import fusewireExpr from './parser/fusewire-expr.js';

/**
 * Map of variables passed to a component.
 * @typedef {import('./component.js').ComponentVars} ComponentVars
 */
/**
 * Any valid value that can be assigned to a component variable.
 * @typedef {import('./component.js').VarValue} VarValue
 */
/**
 * Class constructor for a Component.
 * @typedef {import('./component.js').ComponentConstructor} ComponentConstructor
 */
/**
 * Static constants evaluated during compilation (e.g. version).
 * @typedef {{version?: string}} TemplateConstants
 */
/**
 * A compiled component template representation.
 * @typedef {{render: function(ComponentVars, ComponentId, TemplateConstants=): string, css: string}} CompiledTemplate
 */

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
    /**
     * Iterative property value cursor.
     * @type {VarValue|Array<VarValue>|ComponentVars|undefined}
     */
    let value = data;

    for (const part of parts) {
        if (value === null || value === undefined) {
            return undefined;
        }
        value = /** @type {VarValue|Array<VarValue>|ComponentVars|undefined} */ (
            /**
             * Intermediate object cast.
             * @type {ComponentVars}
             */
            (value)[part]
        );
    }

    return isNegated ? !value : /** @type {VarValue|Array<VarValue>|undefined} */ (value);
}

/**
 * Check if a value is a Component instance or Child
 * @param {VarValue|Array<VarValue>} value - Value to check
 * @returns {boolean} True if value represents a component
 */
function isComponent(value) {
    return value instanceof Child || value instanceof Component;
}

/**
 * Abstract Syntax Tree node returned by the expression parser.
 * @typedef ASTNode
 * @property {string} type
 * @property {string} [value]
 * @property {ASTNode} [expr]
 * @property {ASTNode} [condition]
 * @property {ASTNode} [trueExpr]
 * @property {ASTNode} [falseExpr]
 * @property {ASTNode} [item]
 * @property {ASTNode} [list]
 */

/**
 * Evaluate an AST node against component variables
 * @param {ASTNode} ast - AST node
 * @param {ComponentVars} vars - Component variables
 * @returns {VarValue|Array<VarValue>|undefined} Evaluated value
 */
function evaluateAST(ast, vars) {
    if (!ast) return undefined;
    switch (ast.type) {
        case 'VarPath':
            return getPropertyValue(vars, ast.value);
        case 'String':
            return ast.value;
        case 'Negation':
            return !evaluateAST(ast.expr, vars);
        case 'Ternary':
            return evaluateAST(ast.condition, vars)
                ? evaluateAST(ast.trueExpr, vars)
                : evaluateAST(ast.falseExpr, vars);
        default:
            return undefined;
    }
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @param {boolean} isAttribute - Whether the string is being used in an HTML attribute context
 * @returns {string} Escaped string safe for HTML output
 */
function escapeHtml(str, isAttribute = false) {
    let escaped = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (isAttribute) {
        // Escape characters that can break out of unquoted attributes
        // Space, Tab, Newline, Form Feed, Carriage Return, =
        escaped = escaped.replace(/[ \t\n\f\r=]/g, (match) => {
            return `&#x${match.charCodeAt(0).toString(16)};`;
        });
    }

    return escaped;
}

/**
 * Sanitize a URL to prevent javascript: URIs
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(url) {
    const trimmed = String(url).trim().toLowerCase();
    if (
        trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')
    ) {
        return 'about:blank';
    }
    return url;
}

/**
 * Render a component declaration as an empty mount point
 * @param {Component|Child} decl - Component instance or Child
 * @param {ComponentId} parentId - Parent component ID
 * @returns {string} Mount point HTML
 */
function renderMountPoint(decl, parentId) {
    let name;
    let id;
    if (decl instanceof Child) {
        name = decl.componentName;
        id = decl.componentId || '';
    } else {
        name = /** @type {ComponentConstructor} */ (decl.constructor).componentName;
        id = decl.componentId || '';
    }
    const childId = new ComponentId(name, id);
    return `<fw-mount id="${childId.code}" data-fusewire-id="${childId.code}" data-fusewire-parent-id="${parentId.code}"></fw-mount>`;
}

/**
 * Interpolate variables in a text string with context-aware sanitization
 * @param {string} text - Text with ((...)) placeholders
 * @param {ComponentVars} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @param {TemplateConstants} constants - Template constants (version, etc.)
 * @returns {string} Interpolated text
 */
function interpolateText(text, vars, componentId, constants) {
    let result = '';
    let lastIndex = 0;
    let inTag = false;
    let inAttributeValue = false;
    let currentAttributeName = '';
    let quoteChar = '';

    const regex = new RegExp(INTERPOLATION_REGEX.source, INTERPOLATION_REGEX.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Process text before the match to track context
        const beforeMatch = text.substring(lastIndex, match.index);
        for (let i = 0; i < beforeMatch.length; i++) {
            const char = beforeMatch[i];
            if (char === '<' && !inAttributeValue) {
                inTag = true;
                currentAttributeName = '';
            } else if (char === '>' && !inAttributeValue) {
                inTag = false;
            } else if (inTag) {
                if (!inAttributeValue) {
                    if (char === '"' || char === "'") {
                        inAttributeValue = true;
                        quoteChar = char;
                    } else if (char === '=') {
                        // Attribute name is what was collected before '='
                    } else if (/[a-zA-Z-]/.test(char)) {
                        currentAttributeName += char;
                    } else if (/\s/.test(char)) {
                        currentAttributeName = '';
                    }
                } else if (char === quoteChar) {
                    inAttributeValue = false;
                    quoteChar = '';
                    currentAttributeName = '';
                }
            }
        }

        const path = match[1].trim();
        let value;

        // Special case: ((this)) - placeholder for component instance reference
        if (path === 'this') {
            const safeCode = componentId.code.replace(/#/g, '_');
            value = `__FUSEWIRE_COMPONENT_${safeCode}__`;
        } else if (path === 'componentId') {
            value = escapeHtml(componentId.code, inTag);
        } else if (path === 'componentName') {
            value = escapeHtml(componentId.name, inTag);
        } else if (path === 'componentVersion') {
            value = escapeHtml(constants.version || '', inTag);
        } else {
            let rawValue;
            try {
                const ast = fusewireExpr.parse(path);
                rawValue = evaluateAST(ast, vars);
            } catch (e) {
                console.warn(
                    `Template interpolation syntax error in "${path}": ${/** @type {Error} */ (e).message}`,
                );
                rawValue = undefined;
            }

            if (rawValue === undefined || rawValue === null) {
                value = '';
            } else if (isComponent(rawValue)) {
                value = renderMountPoint(/** @type {Component|Child} */ (rawValue), componentId);
            } else if (Array.isArray(rawValue) && rawValue.length > 0 && isComponent(rawValue[0])) {
                const mountPoints = rawValue
                    .map((comp) =>
                        renderMountPoint(/** @type {Component|Child} */ (comp), componentId),
                    )
                    .join('');
                value = `<fw-each id="${componentId.code}:${escapeHtml(path, inTag)}" data-fusewire-each="${escapeHtml(path, inTag)}">${mountPoints}</fw-each>`;
            } else {
                let strValue = String(rawValue);

                // Context-aware sanitization
                const dangerousAttrs = [
                    'href',
                    'src',
                    'action',
                    'formaction',
                    'data',
                    'background',
                    'on',
                ];
                const isDangerousAttr = dangerousAttrs.some(
                    (attr) =>
                        currentAttributeName.toLowerCase() === attr ||
                        (attr === 'on' && currentAttributeName.toLowerCase().startsWith('on')),
                );

                if (inTag && isDangerousAttr) {
                    strValue = sanitizeUrl(strValue);
                }

                // If inTag is true but inAttributeValue is false, we are likely in an unquoted attribute
                // (or just started an attribute name, but placeholders shouldn't be there usually)
                // We use isAttribute=true for all tag contexts for maximum safety.
                value = escapeHtml(strValue, inTag);
            }
        }

        result += beforeMatch + value;
        lastIndex = regex.lastIndex;
    }

    result += text.substring(lastIndex);
    return result;
}

/**
 * Process directives (fw-if, fw-each) with nesting-aware tag matching in structural order
 * @param {string} html - HTML template
 * @param {ComponentVars} vars - Variable data
 * @param {ComponentId} componentId - Component instance ID
 * @param {TemplateConstants} constants - Template constants
 * @returns {string} Processed HTML
 */
function processDirectives(html, vars, componentId, constants) {
    let result = String(html);
    let match;

    while ((match = DIRECTIVE_REGEX.exec(result)) !== null) {
        const [fullMatch, tag, beforeAttrs, directiveName, expr, afterAttrs] = match;
        const directive = directiveName.toLowerCase();
        const contentStart = match.index + fullMatch.length;

        const closeIndex = findMatchingClose(result, tag, contentStart);
        if (closeIndex === -1) {
            // Unclosed tag, just strip the directive to prevent infinite loops
            const replacement = `<${tag}${beforeAttrs} ${afterAttrs}>`;
            result =
                result.substring(0, match.index) + replacement + result.substring(contentStart);
            continue;
        }

        const content = result.substring(contentStart, closeIndex);
        const closeTag = `</${tag}>`;
        const elementEnd = closeIndex + closeTag.length;

        if (directive === 'fw-if') {
            // When both fw-if and fw-each are on the same element, fw-each takes priority.
            // Rewrite so fw-each is matched first; fw-if is kept for per-item evaluation.
            const combinedAttrs = beforeAttrs + afterAttrs;
            const eachInAttrs = combinedAttrs.match(/\s+fw-each=["']([^"']+)["']/i);
            if (eachInAttrs) {
                const cleanAttrs = combinedAttrs.replace(eachInAttrs[0], '');
                const rewritten =
                    `<${tag} fw-each="${eachInAttrs[1]}"${cleanAttrs} fw-if="${expr}">` +
                    content +
                    closeTag;
                result =
                    result.substring(0, match.index) + rewritten + result.substring(elementEnd);
                continue;
            }

            const condition = expr;
            let value;
            try {
                const ast = fusewireExpr.parse(condition.trim());
                value = evaluateAST(ast, vars);
            } catch (e) {
                console.warn(
                    `fw-if syntax error in "${condition}": ${/** @type {Error} */ (e).message}`,
                );
                value = false;
            }

            let replacement;

            if (!value) {
                replacement = '';
            } else {
                const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
                const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;

                replacement = `${openTag}${content}${closeTag}`;
            }

            result = result.substring(0, match.index) + replacement + result.substring(elementEnd);
        } else if (directive === 'fw-each') {
            const loopExpr = expr;
            let itemName, collectionPath;
            try {
                const ast = fusewireExpr.parse(loopExpr.trim());
                if (ast.type === 'ForEach') {
                    itemName = ast.item.value;
                    collectionPath = ast.list.value;
                } else {
                    throw new Error('Expected ForEach syntax');
                }
            } catch (e) {
                console.warn(
                    `Invalid fw-each syntax: ${loopExpr}. ${/** @type {Error} */ (e).message}`,
                );
                const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
                const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
                const replacement = `${openTag}${content}${closeTag}`;
                result =
                    result.substring(0, match.index) + replacement + result.substring(elementEnd);
                continue;
            }

            const collection = getPropertyValue(vars, collectionPath);

            let replacement = '';
            if (Array.isArray(collection) && collection.length > 0) {
                const attrs = (beforeAttrs + ' ' + afterAttrs).trim();
                const itemResults = collection.map((item) => {
                    const scopedVars = {
                        ...vars,
                        [itemName]: item,
                    };

                    const itemAttrs = attrs ? ` ${attrs}` : '';
                    let itemHtml = `<${tag}${itemAttrs}>${content}${closeTag}`;

                    // Process nested directives for this isolated item structurally
                    itemHtml = processDirectives(itemHtml, scopedVars, componentId, constants);

                    // Interpolate variables scoped exclusively within this item's context
                    return interpolateText(itemHtml, scopedVars, componentId, constants);
                });
                replacement = itemResults.join('');
            }

            result = result.substring(0, match.index) + replacement + result.substring(elementEnd);
        }
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

            // Process directives (fw-if, fw-each) structural evaluation (top-down)
            html = processDirectives(html, vars, componentId, constants);

            // Interpolate variables (fills in values)
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
