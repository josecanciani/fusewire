import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Component directories to scan. Each entry is a root from which .js files
// are discovered recursively.
const componentDirs = [join(__dirname, '../../htdocs/components')];

// Valid scalar types for component vars (from component.js typedefs).
// Component subclass names and unions/arrays of these are also accepted.
const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'null']);

// Types that are always valid as component var types.
const FRAMEWORK_TYPES = new Set([
    ...SCALAR_TYPES,
    'Component',
    'ComponentReference',
]);

// Types that are too generic — these should be replaced with specific types.
const FORBIDDEN_TYPES = new Set(['Object', 'Function', 'Any', '*']);

/**
 * Recursively find all .js files under a directory tree.
 * @param {string} dir - Directory to scan
 * @param {string} rootDir - Root directory used to derive component names
 * @returns {Array<{jsPath: string, label: string, componentName: string}>} JS files found
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
 * Excludes:
 *   - Lines starting with _ or # (framework/private fields)
 *   - static fields
 *   - Methods (contain `(`)
 *   - Getters/setters
 *   - Lines inside nested {} (method bodies)
 *
 * @param {string} classBody - Source code of the class body (between outermost { and })
 * @returns {Array<{name: string, line: number, lineContent: string}>} Field declarations
 */
function extractClassFields(classBody) {
    const fields = [];
    const lines = classBody.split('\n');
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Track brace depth — only look at depth 0 (class body level)
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;

        if (depth === 0 && trimmed.length > 0) {
            // Skip blank lines, comments, static, getters/setters, methods
            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                // comment line — skip
            } else if (trimmed.startsWith('static ')) {
                // static field or method — skip
            } else if (trimmed.startsWith('get ') || trimmed.startsWith('set ')) {
                // getter/setter — skip
            } else if (trimmed.startsWith('async ')) {
                // async method — skip
            } else if (trimmed.startsWith('constructor')) {
                // constructor — skip
            } else if (trimmed.includes('(')) {
                // method declaration — skip
            } else {
                // Potential class field: name = value; or name;
                const fieldMatch = trimmed.match(/^([a-zA-Z$][\w$]*)\s*[=;]/);
                if (fieldMatch) {
                    const fieldName = fieldMatch[1];
                    // Skip framework/private fields
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
 * Looks for a pattern like: /** @type {X} * / on the line(s) immediately preceding the field.
 * @param {Array<string>} lines - All lines of the class body
 * @param {number} fieldLine - Line index of the field declaration
 * @returns {string|null} The type string (e.g. 'number', 'string|null') or null if not found
 */
function findTypeAnnotation(lines, fieldLine) {
    // Scan backwards from the field line to find the JSDoc comment
    for (let i = fieldLine - 1; i >= 0 && i >= fieldLine - 5; i--) {
        const trimmed = lines[i].trim();
        // Single-line JSDoc: /** @type {X} */
        const singleLineMatch = trimmed.match(/\/\*\*\s*@type\s*\{([^}]+)\}\s*\*\//);
        if (singleLineMatch) return singleLineMatch[1];
        // Multi-line: look for @type line inside a JSDoc block
        const typeLineMatch = trimmed.match(/@type\s*\{([^}]+)\}/);
        if (typeLineMatch) return typeLineMatch[1];
        // Stop scanning if we hit a non-comment, non-blank line
        if (trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.startsWith('//')) {
            break;
        }
    }
    return null;
}

/**
 * Extract the primary type tokens from a JSDoc type expression.
 * Strips Array.<>, Array<>, nullable ?, and splits unions.
 * E.g. "Array.<Component|null>" → ['Component', 'null']
 *       "string|number" → ['string', 'number']
 * @param {string} typeExpr - JSDoc type expression
 * @returns {Array<string>} Individual type tokens
 */
function extractTypeTokens(typeExpr) {
    // Strip Array.<...> or Array<...> wrappers
    let inner = typeExpr;
    const arrayMatch = inner.match(/^Array\.<(.+)>$/) || inner.match(/^Array<(.+)>$/);
    if (arrayMatch) inner = arrayMatch[1];
    // Strip leading ? (nullable)
    if (inner.startsWith('?')) inner = inner.slice(1);
    // Split on | for unions
    return inner.split('|').map((t) => t.trim()).filter(Boolean);
}

/**
 * Check if a type expression is valid for a component var.
 * Valid types: scalars, Component, ComponentReference, custom component class names,
 * ScalarObject, object, Arrays of these, and unions of these.
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
 * Find all classes in a JS file that extend Component (directly or indirectly).
 * Returns the class name and body for each.
 * @param {string} source - Full JS source code
 * @returns {Array<{className: string, classBody: string, bodyStartLine: number}>} Classes found
 */
function findComponentClasses(source) {
    const classes = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        // Match: class Foo extends Component {
        // Also matches: export class Foo extends Component {
        // Also matches: class Foo extends SomeBase { (we can't know the full hierarchy,
        // but we check for Component or any name — projects may have intermediate bases)
        const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)\s+extends\s+(\w+)/);
        if (!classMatch) continue;

        const className = classMatch[1];
        const baseName = classMatch[2];

        // Only check classes that extend Component (or a subclass with "Component" in the name)
        // For simplicity and correctness, check any class that extends anything —
        // the test only runs on component directories where all classes are components.

        // Find the opening brace
        let braceStart = lines[i].indexOf('{');
        let startLine = i;
        if (braceStart === -1) {
            // Opening brace might be on the next line
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].includes('{')) {
                    startLine = j;
                    braceStart = 0; // found it
                    break;
                }
            }
        }

        // Extract class body by tracking braces
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
                bodyStartLine = j + 1; // body starts after the opening brace line
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
 * Var JSDoc validation for component files.
 *
 * Ensures every public class field (component var) has a valid JSDoc @type annotation.
 *
 * Rules:
 *   Rule 1 — Every public class field must have a /** @type {X} * / annotation.
 *   Rule 2 — The type must not use forbidden generic types (Object, Function, Any, *).
 */
describe('Var JSDoc Validation', () => {
    const files = componentDirs.flatMap((dir) => findComponentFiles(dir));

    for (const { jsPath, label } of files) {
        describe(label, () => {
            const source = readFileSync(jsPath, 'utf-8');
            const componentClasses = findComponentClasses(source);

            for (const { className, classBody, bodyStartLine } of componentClasses) {
                const fields = extractClassFields(classBody);
                const bodyLines = classBody.split('\n');

                it(`${className}: all public class fields have @type JSDoc`, () => {
                    const violations = [];
                    for (const field of fields) {
                        const typeExpr = findTypeAnnotation(bodyLines, field.line);
                        if (!typeExpr) {
                            violations.push(
                                `field "${field.name}" (line ${bodyStartLine + field.line}) has no @type annotation`,
                            );
                        }
                    }
                    if (violations.length > 0) {
                        assert.fail(
                            `${jsPath}\n` +
                                `${className} has public class fields without @type JSDoc:\n` +
                                violations.map((v) => `  ${v}`).join('\n') +
                                '\n\nFix: add /** @type {X} */ before each field declaration.\n' +
                                'Valid types: string, number, boolean, null, Component, ComponentReference,\n' +
                                'specific component class names, ScalarObject, Array.<Type>, or unions of these.',
                        );
                    }
                });

                it(`${className}: @type annotations use valid component var types`, () => {
                    const violations = [];
                    for (const field of fields) {
                        const typeExpr = findTypeAnnotation(bodyLines, field.line);
                        if (!typeExpr) continue; // Missing types caught by the previous test
                        const result = validateVarType(typeExpr);
                        if (!result.valid) {
                            violations.push(
                                `field "${field.name}" (line ${bodyStartLine + field.line}): ${result.reason}`,
                            );
                        }
                    }
                    if (violations.length > 0) {
                        assert.fail(
                            `${jsPath}\n` +
                                `${className} has @type annotations with invalid types:\n` +
                                violations.map((v) => `  ${v}`).join('\n'),
                        );
                    }
                });
            }
        });
    }
});
