import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'template-attribute-order';

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
 * Extract all opening tags from an HTML string, handling multi-line tags.
 * Returns each tag with its starting line number and attribute list.
 * @param {string} html - HTML content
 * @returns {Array.<{line: number, tag: string, attrs: Array.<{name: string, pos: number}>}>} Opening tags found
 */
function extractOpeningTags(html) {
    const tags = [];
    const tagRegex = /<(\w+)((?:\s+[^>]*?)?)>/gs;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const tagName = match[1];
        const attrString = match[2];
        const line = html.substring(0, match.index).split('\n').length;

        const attrs = [];
        const attrRegex = /\s+([\w-]+)=/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            attrs.push({ name: attrMatch[1], pos: attrMatch.index });
        }

        if (attrs.length > 0) {
            tags.push({ line, tag: tagName, attrs });
        }
    }
    return tags;
}

/**
 * Check that fw-* directive attributes appear before regular attributes, and that
 * fw-each appears before fw-if when both are on the same element.
 *
 * Rule 1 — fw-each before fw-if: when both directives are on the same element,
 * fw-each must appear first. The template compiler processes whichever directive
 * the regex matches first. When fw-if appears first, the condition is evaluated
 * before the loop variable exists in scope, which silently strips the element.
 * Although the compiler works around this, declaring fw-each first makes the
 * intended evaluation order explicit and avoids relying on the workaround.
 *
 * Rule 2 — fw-* attributes before regular attributes: directive attributes like
 * fw-if and fw-each control whether an element exists at all. Placing them after
 * long attribute lists (e.g. class="btn btn-sm btn-outline-secondary ...") buries
 * the structural directive where developers are likely to miss it during review.
 * Leading with fw-* attributes makes the element's conditional or iterative
 * nature immediately visible.
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
            const fwAttrs = attrs.filter((a) => a.name.startsWith('fw-'));
            if (fwAttrs.length === 0) continue;

            // Rule 1: fw-each must come before fw-if
            const eachAttr = attrs.find((a) => a.name === 'fw-each');
            const ifAttr = attrs.find((a) => a.name === 'fw-if');
            if (eachAttr && ifAttr && ifAttr.pos < eachAttr.pos) {
                violations.push({
                    file,
                    message:
                        `${label}:${line} <${tag}> has fw-if before fw-each.\n` +
                        'fw-each must appear before fw-if when both are on the same element.\n' +
                        'The template compiler processes directives in source order. When fw-if\n' +
                        'appears first, the condition is evaluated before the loop variable exists\n' +
                        'in scope. Although the compiler works around this, declaring fw-each first\n' +
                        'makes the intended evaluation order explicit.\n' +
                        'Fix: move fw-each before fw-if in the opening tag.',
                });
            }

            // Rule 2: fw-* attributes must come before regular attributes
            const firstFw = fwAttrs[0];
            const regularsBefore = attrs.filter((a) => !a.name.startsWith('fw-') && a.pos < firstFw.pos);
            if (regularsBefore.length > 0) {
                const regularNames = regularsBefore.map((a) => a.name).join(', ');
                violations.push({
                    file,
                    message:
                        `${label}:${line} <${tag}> has regular attributes (${regularNames}) before fw-* directives.\n` +
                        'Directive attributes like fw-if and fw-each control whether an element\n' +
                        'exists at all. Placing them after long attribute lists buries the structural\n' +
                        'directive where developers are likely to miss it during code review.\n' +
                        'Fix: move fw-* attributes to the beginning of the opening tag.',
                });
            }
        }
    }

    return violations;
}
