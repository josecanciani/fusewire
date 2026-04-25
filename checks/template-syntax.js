import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FW_EACH_SYNTAX, extractOpeningTags, findMatchingClose, VAR_PATH } from '../src/template-parser.js';

export const name = 'template-syntax';

/**
 * Recursively find all .html files under a directory tree.
 * @param {string} dir - Directory to scan
 * @returns {Array.<string>} Absolute paths to HTML files
 */
function findHtmlFiles(dir) {
    const files = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findHtmlFiles(fullPath));
        } else if (entry.name.endsWith('.html')) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Validate template directive syntax in component HTML files.
 *
 * Uses the same regex patterns as the runtime template compiler
 * (src/template-parser.js) so that build-time validation catches exactly the
 * same errors the compiler would encounter at runtime.
 *
 * Two rules:
 *
 *   Rule 1 — fw-each expression syntax: the value must follow the
 *   "item in collection" pattern. The item name must be a simple identifier
 *   ([a-zA-Z0-9_]). The collection path may use dot notation (e.g. "user.posts")
 *   but must not contain special characters like $.
 *
 *   Rule 2 — Unclosed directive tags: elements with fw-if or fw-each must have
 *   a matching closing tag. An unclosed tag causes the runtime compiler to strip
 *   the directive silently, hiding the bug.
 *
 * @param {string} componentDir - Absolute path to the component directory to scan
 * @param {import('./index.js').CheckConfig} _config - Project-level configuration (unused by this check)
 * @returns {Array.<import('./index.js').CheckViolation>} Violations found
 */
export function check(componentDir, _config) {
    const htmlFiles = findHtmlFiles(componentDir);
    const violations = [];

    for (const file of htmlFiles) {
        const content = readFileSync(file, 'utf-8');
        const label = relative(componentDir, file);
        const openingTags = extractOpeningTags(content);

        for (const { line, tag, attrs } of openingTags) {
            const eachAttr = attrs.find((a) => a.name === 'fw-each');
            const ifAttr = attrs.find((a) => a.name === 'fw-if');

            // Rule 1: fw-each expression must match "item in collection"
            if (eachAttr && eachAttr.value) {
                const expr = eachAttr.value;
                if (!FW_EACH_SYNTAX.test(expr)) {
                    violations.push({
                        file,
                        message:
                            `${label}:${line} <${tag}> has invalid fw-each syntax: "${expr}"\n` +
                            'fw-each requires the format: fw-each="itemName in collectionPath"\n' +
                            '  - itemName must be a simple identifier (letters, digits, underscores)\n' +
                            '  - collectionPath must be a var name, optionally with dots (e.g. "user.posts")\n' +
                            '  - $ prefixes, spaces in names, and special characters are not allowed\n' +
                            'Fix: correct the expression to match the required format.',
                    });
                }
            }

            // Rule 3: fw-if expression must be a simple variable path, no JS expressions
            if (ifAttr && ifAttr.value) {
                const expr = ifAttr.value.trim();
                const isValidIf = new RegExp(`^!?${VAR_PATH}$`).test(expr);
                if (!isValidIf) {
                    violations.push({
                        file,
                        message:
                            `${label}:${line} <${tag}> has invalid fw-if syntax: "${expr}"\n` +
                            'fw-if only accepts boolean variable paths (e.g., "isVisible", "!user.isLoggedIn", "$hasItems").\n' +
                            'It does NOT evaluate JavaScript expressions. Do not use spaces, comparison operators (===, >), or function calls.\n' +
                            'Fix: expose a boolean getter in your JS component (e.g., get isStep1() { return this.step === 1; }) and use that.',
                    });
                }
            }

            // Rule 2: directive elements must have matching closing tags
            if (eachAttr || ifAttr) {
                const directive = eachAttr ? 'fw-each' : 'fw-if';
                const tagRegex = new RegExp(
                    `<${tag}(?:\\s[^>]*)?>`,
                    'gi',
                );
                // Find the specific opening tag occurrence at this line
                const lines = content.split('\n');
                let charOffset = 0;
                for (let i = 0; i < line - 1; i++) {
                    charOffset += lines[i].length + 1;
                }
                // Search for the opening tag near this line offset
                tagRegex.lastIndex = charOffset;
                const tagMatch = tagRegex.exec(content);
                if (tagMatch) {
                    const contentStart = tagMatch.index + tagMatch[0].length;
                    const closeIndex = findMatchingClose(content, tag, contentStart);
                    if (closeIndex === -1) {
                        violations.push({
                            file,
                            message:
                                `${label}:${line} <${tag} ${directive}="..."> has no matching closing tag.\n` +
                                `The template compiler requires a </${tag}> for every <${tag}> with a directive.\n` +
                                `An unclosed tag causes the compiler to silently strip the ${directive} directive,\n` +
                                'which hides the bug until runtime.\n' +
                                `Fix: add the missing </${tag}> closing tag.`,
                        });
                    }
                }
            }
        }
    }

    return violations;
}
