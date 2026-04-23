import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'var-jsdoc';

// Types that are too generic — these should be replaced with specific types.
const FORBIDDEN_TYPES = new Set(['Object', 'Function', 'Any', '*']);

/**
 * Recursively find all .js files under a directory tree.
 * @param {string} dir - Directory to scan
 * @param {string} rootDir - Root directory used to derive component names
 * @returns {Array.<{jsPath: string, label: string, componentName: string}>} JS files found
 */
function findComponentFiles(dir, rootDir = dir) {
    const files = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findComponentFiles(fullPath, rootDir));
        } else if (entry.name.endsWith('.js')) {
            const name = entry.name.replace('.js', '');
            const relDir = relative(rootDir, dir).replaceAll('\\', '/');
            const componentName = relDir ? `${relDir}/${name}` : name;
            files.push({ jsPath: fullPath, label: name, componentName });
        }
    }
    return files;
}

/**
 * Extract class field declarations from a class body in source code.
 *
 * Finds lines that declare a class field (ES2022 public instance fields):
 *   fieldName = initializer;
 *   fieldName;
 *
 * Excludes framework/private fields (starting with _ or #), static fields,
 * methods, getters/setters, and lines inside nested {} (method bodies).
 *
 * @param {string} classBody - Source code of the class body (between outermost braces)
 * @returns {Array.<{name: string, line: number, lineContent: string}>} Field declarations
 */
function extractClassFields(classBody) {
    const fields = [];
    const lines = classBody.split('\n');
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;

        if (depth === 0 && trimmed.length > 0) {
            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                // comment line
            } else if (trimmed.startsWith('static ')) {
                // static field or method
            } else if (trimmed.startsWith('get ') || trimmed.startsWith('set ')) {
                // getter/setter
            } else if (trimmed.startsWith('async ')) {
                // async method
            } else if (trimmed.startsWith('constructor')) {
                // constructor
            } else if (trimmed.includes('(')) {
                // method declaration
            } else {
                const fieldMatch = trimmed.match(/^([a-zA-Z$][\w$]*)\s*[=;]/);
                if (fieldMatch) {
                    const fieldName = fieldMatch[1];
                    if (!fieldName.startsWith('_') && !fieldName.startsWith('#')) {
                        fields.push({ name: fieldName, line: i, lineContent: line });
                    }
                }
            }
        }

        depth += opens;
        depth -= closes;
        if (depth < 0) depth = 0;
    }
    return fields;
}

/**
 * Find the JSDoc @type annotation for a class field by scanning lines above it.
 * Looks for a pattern like: @type {X} on the line(s) immediately preceding the field.
 * @param {Array.<string>} lines - All lines of the class body
 * @param {number} fieldLine - Line index of the field declaration
 * @returns {string|null} The type string (e.g. 'number', 'string|null') or null if not found
 */
function findTypeAnnotation(lines, fieldLine) {
    for (let i = fieldLine - 1; i >= 0 && i >= fieldLine - 5; i--) {
        const trimmed = lines[i].trim();
        const singleLineMatch = trimmed.match(/\/\*\*\s*@type\s*\{([^}]+)\}\s*\*\//);
        if (singleLineMatch) return singleLineMatch[1];
        const typeLineMatch = trimmed.match(/@type\s*\{([^}]+)\}/);
        if (typeLineMatch) return typeLineMatch[1];
        if (trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.startsWith('//')) {
            break;
        }
    }
    return null;
}

/**
 * Extract the primary type tokens from a JSDoc type expression.
 * Strips Array wrappers, nullable markers, and splits unions.
 * E.g. "Array.<Component|null>" yields ['Component', 'null'].
 * @param {string} typeExpr - JSDoc type expression
 * @returns {Array.<string>} Individual type tokens
 */
function extractTypeTokens(typeExpr) {
    let inner = typeExpr;
    const arrayMatch = inner.match(/^Array\.<(.+)>$/) || inner.match(/^Array<(.+)>$/);
    if (arrayMatch) inner = arrayMatch[1];
    if (inner.startsWith('?')) inner = inner.slice(1);
    return inner.split('|').map((t) => t.trim()).filter(Boolean);
}

/**
 * Check if a type expression is valid for a component var.
 * Forbidden: generic Object, Function, Any, *.
 * @param {string} typeExpr - JSDoc type expression
 * @returns {{valid: boolean, reason: string}} Validation result
 */
function validateVarType(typeExpr) {
    const tokens = extractTypeTokens(typeExpr);
    for (const token of tokens) {
        if (FORBIDDEN_TYPES.has(token)) {
            return { valid: false, reason: `forbidden generic type "${token}" — use a specific type` };
        }
    }
    return { valid: true, reason: '' };
}

/**
 * Find all classes in a JS file that extend another class.
 * Returns the class name and body for each.
 * @param {string} source - Full JS source code
 * @returns {Array.<{className: string, classBody: string, bodyStartLine: number}>} Classes found
 */
function findComponentClasses(source) {
    const classes = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)\s+extends\s+(\w+)/);
        if (!classMatch) continue;

        const className = classMatch[1];

        let braceStart = lines[i].indexOf('{');
        let startLine = i;
        if (braceStart === -1) {
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].includes('{')) {
                    startLine = j;
                    braceStart = 0;
                    break;
                }
            }
        }

        let depth = 0;
        let bodyLines = [];
        let bodyStartLine = startLine;
        let foundBody = false;

        for (let j = startLine; j < lines.length; j++) {
            const line = lines[j];
            const opens = (line.match(/\{/g) ?? []).length;
            const closes = (line.match(/\}/g) ?? []).length;

            if (!foundBody && opens > 0) {
                foundBody = true;
                bodyStartLine = j + 1;
            }

            depth += opens;
            depth -= closes;

            if (foundBody) {
                bodyLines.push(line);
            }

            if (foundBody && depth === 0) {
                break;
            }
        }

        classes.push({
            className,
            classBody: bodyLines.join('\n'),
            bodyStartLine,
        });
    }
    return classes;
}

/**
 * Check that every public class field in component JS files has a valid
 * JSDoc @type annotation.
 *
 * Two rules per component class:
 *
 *   Rule 1 — Every public class field must have a @type annotation.
 *
 *   Rule 2 — The type must not use forbidden generic types (Object, Function, Any, *).
 *
 * @param {string} componentDir - Absolute path to the component directory to scan
 * @param {import('./index.js').CheckConfig} _config - Project-level configuration (unused by this check)
 * @returns {Array.<import('./index.js').CheckViolation>} Violations found
 */
export function check(componentDir, _config) {
    const files = findComponentFiles(componentDir);
    const violations = [];

    for (const { jsPath } of files) {
        const source = readFileSync(jsPath, 'utf-8');
        const label = relative(componentDir, jsPath);
        const componentClasses = findComponentClasses(source);

        for (const { className, classBody, bodyStartLine } of componentClasses) {
            const fields = extractClassFields(classBody);
            const bodyLines = classBody.split('\n');

            // Rule 1: missing @type
            const missingType = [];
            for (const field of fields) {
                const typeExpr = findTypeAnnotation(bodyLines, field.line);
                if (!typeExpr) {
                    missingType.push(
                        `field "${field.name}" (line ${bodyStartLine + field.line}) has no @type annotation`,
                    );
                }
            }
            if (missingType.length > 0) {
                violations.push({
                    file: jsPath,
                    message:
                        `${label}: ${className} has public class fields without @type JSDoc:\n` +
                        missingType.map((v) => `  ${v}`).join('\n') +
                        '\n\nFix: add /** @type {X} */ before each field declaration.\n' +
                        'Valid types: string, number, boolean, null, Component, Child,\n' +
                        'specific component class names, ScalarObject, Array.<Type>, or unions of these.',
                });
            }

            // Rule 2: invalid types
            const invalidType = [];
            for (const field of fields) {
                const typeExpr = findTypeAnnotation(bodyLines, field.line);
                if (!typeExpr) continue;
                const result = validateVarType(typeExpr);
                if (!result.valid) {
                    invalidType.push(
                        `field "${field.name}" (line ${bodyStartLine + field.line}): ${result.reason}`,
                    );
                }
            }
            if (invalidType.length > 0) {
                violations.push({
                    file: jsPath,
                    message:
                        `${label}: ${className} has @type annotations with invalid types:\n` +
                        invalidType.map((v) => `  ${v}`).join('\n'),
                });
            }
        }
    }

    return violations;
}
