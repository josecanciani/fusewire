/**
 * Shared template parsing utilities for FuseWire.
 *
 * This module contains pure functions and regex patterns used by both the
 * runtime template compiler (src/template-compiler.js) and the build-time
 * quality checks (checks/). Browser-compatible ES module — no DOM or Node APIs.
 */

/**
 * Regex source pattern for a single variable identifier (word characters plus
 * dollar sign: [a-zA-Z0-9_$]).  Not a standalone regex — designed for
 * composition into larger patterns like VAR_PATH and INTERPOLATION_REGEX.
 * @type {string}
 */
export const VAR_NAME = '[\\w$]+';

/**
 * Regex source pattern for a dotted variable path (e.g. "user.name", "item",
 * "deep.nested.value").  Built from VAR_NAME.  Not a standalone regex —
 * designed for composition.
 * @type {string}
 */
export const VAR_PATH = `${VAR_NAME}(?:\\.${VAR_NAME})*`;

/**
 * Regex that matches a valid fw-each expression: "itemName in collectionPath".
 *
 * - Item name: a single identifier (VAR_NAME)
 * - Collection path: dot-separated identifiers (VAR_PATH)
 *
 * Capture groups: (1) item name, (2) collection path.
 * @type {RegExp}
 */
export const FW_EACH_SYNTAX = new RegExp(`^\\s*(${VAR_NAME})\\s+in\\s+(${VAR_PATH})\\s*$`);

/**
 * Regex that matches the first fw-if or fw-each directive in an opening HTML tag.
 *
 * Capture groups:
 *   (1) tag name
 *   (2) attributes before the directive
 *   (3) directive name ("fw-if" or "fw-each")
 *   (4) directive expression value
 *   (5) attributes after the directive
 * @type {RegExp}
 */
export const DIRECTIVE_REGEX =
    /<(\w+)((?:[^"'>]|"[^"]*"|'[^']*')*?)\s+(fw-if|fw-each)=[\x22']([^\x22']+)[\x22']((?:[^"'>]|"[^"]*"|'[^']*')*)>/i;

/**
 * Regex that matches a ((...)) interpolation placeholder.  The capture group
 * only matches valid variable paths (VAR_PATH) so adjacent JS parentheses
 * like goTo(((dot.index))) do not leak into the match.
 *
 * Capture group (1) is the variable path (e.g. "user.name", "this", "count").
 * Use with the global flag for iterative matching.
 * @type {RegExp}
 */
export const INTERPOLATION_REGEX = /\(\(([^()]*)\)\)/g;

/**
 * Find the position of the matching closing tag, accounting for nesting.
 * Handles same-tag nesting correctly (e.g., div inside div).
 * @param {string} html - HTML string to search in
 * @param {string} tagName - Tag name to match (e.g., "div")
 * @param {number} startIndex - Position after the opening tag's closing bracket
 * @returns {number} Position of the matching closing tag's `<`, or -1 if not found
 */
export function findMatchingClose(html, tagName, startIndex) {
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
 * Extract all opening tags from an HTML string, handling multi-line tags.
 * Returns each tag with its starting line number and attribute list.
 * @param {string} html - HTML content
 * @returns {Array.<{line: number, tag: string, attrs: Array.<{name: string, pos: number, value: string}>}>} Opening tags found
 */
export function extractOpeningTags(html) {
    const tags = [];
    const tagRegex = /<(\w+)((?:\s+(?:[^"'>]|"[^"]*"|'[^']*')*?)?)>/gs;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const tagName = match[1];
        const attrString = match[2];
        const line = html.substring(0, match.index).split('\n').length;

        const attrs = [];
        const attrRegex = /\s+([\w-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            attrs.push({
                name: attrMatch[1],
                pos: attrMatch.index,
                value: attrMatch[2] ?? '',
            });
        }

        if (attrs.length > 0) {
            tags.push({ line, tag: tagName, attrs });
        }
    }
    return tags;
}
