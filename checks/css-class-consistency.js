import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

export const name = 'css-class-consistency';

/**
 * Extract static CSS class tokens from an HTML string.
 * Tokens that contain (( are skipped — they are dynamic interpolation and
 * cannot be statically resolved to a single class name.
 * @param {string} html - HTML content
 * @returns {Set.<string>} Static class names referenced in the HTML
 */
function extractHtmlClasses(html) {
    const classes = new Set();
    const classAttrRegex = /class="([^"]*)"/g;
    let match;
    while ((match = classAttrRegex.exec(html)) !== null) {
        for (const token of match[1].split(/\s+/)) {
            if (token && !token.includes('((')) {
                classes.add(token);
            }
        }
    }
    return classes;
}

/**
 * Read a fw-annotation comment from a CSS string.
 * @param {string} css - CSS content
 * @param {string} annotation - Annotation keyword (e.g. 'fw-external-classes')
 * @returns {Set.<string>} Class names listed in the annotation
 */
function extractAnnotation(css, annotation) {
    const regex = new RegExp(`\\/\\*\\s*${annotation}:\\s*([^*]+)\\*\\/`);
    const match = css.match(regex);
    if (!match) return new Set();
    return new Set(match[1].split(',').map((c) => c.trim()).filter(Boolean));
}

/**
 * Extract depth-0 CSS class names only.
 * Lines inside nested {} blocks (at depth >= 1) are excluded — they belong
 * to a parent selector's scope, not the component's own class list.
 * Strips block comments before scanning.
 * @param {string} css - CSS content
 * @returns {Set.<string>} Class names that appear as top-level selectors
 */
function extractCssClasses(css) {
    const classes = new Set();
    const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const line of cleanCss.split('\n')) {
        if (depth === 0) {
            const match = line.trimStart().match(/^\.([\w-]+)/);
            if (match) classes.add(match[1]);
        }
        depth += (line.match(/\{/g) ?? []).length;
        depth -= (line.match(/\}/g) ?? []).length;
        if (depth < 0) depth = 0;
    }
    return classes;
}

/**
 * Extract nested CSS structure: a map from each simple top-level class selector
 * to the set of class names nested inside it.
 *
 * Only simple single-class selectors at depth 0 are tracked as parent scopes
 * (e.g. `.Console_Line {`). Combinators and multi-class selectors are skipped.
 * Only immediate child selectors at depth 1 are collected as nested classes
 * (e.g. `.log-warn {` or `&.log-warn {` inside a parent scope).
 * @param {string} css - CSS content
 * @returns {Map.<string, Set.<string>>} Map from parent class to nested class names
 */
function extractCssNesting(css) {
    const nesting = new Map();
    const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    let currentParent = null;
    for (const line of cleanCss.split('\n')) {
        const trimmed = line.trimStart();
        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;
        if (opens > 0) {
            if (depth === 0) {
                const simpleMatch = trimmed.match(/^\.([\w-]+)\s*\{/);
                currentParent = simpleMatch ? simpleMatch[1] : null;
            } else if (depth === 1 && currentParent) {
                const nestedMatch = trimmed.match(/^&?\.([\w-]+)/);
                if (nestedMatch) {
                    if (!nesting.has(currentParent)) nesting.set(currentParent, new Set());
                    nesting.get(currentParent).add(nestedMatch[1]);
                }
            }
        }
        depth += opens;
        depth -= closes;
        if (depth <= 0) {
            depth = 0;
            currentParent = null;
        }
    }
    return nesting;
}

/**
 * Derive the CSS class name used for a component's DOM wrapper.
 * Matches the framework's toCssName utility: 'Console/Line' becomes 'Console_Line'.
 * @param {string} componentName - Component name, e.g. 'Console/Line'
 * @returns {string} CSS class name, e.g. 'Console_Line'
 */
function toComponentCssClass(componentName) {
    return componentName.replaceAll('/', '_');
}

/**
 * Parse a JS file for createChild() calls and return the component name arguments.
 * @param {string|null} jsPath - Path to the component JS file (null if absent)
 * @returns {Set.<string>} Component names passed to createChild (e.g. 'Console/Line')
 */
function extractChildComponents(jsPath) {
    if (!jsPath) return new Set();
    const js = readFileSync(jsPath, 'utf-8');
    const children = new Set();
    const regex = /createChild\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(js)) !== null) children.add(match[1]);
    return children;
}

/**
 * Recursively find all .html + .css file pairs under a directory tree.
 * Also includes the sibling .js file path when it exists.
 * Only pairs where both .html and .css exist are returned.
 * @param {string} dir - Directory to scan
 * @param {string} rootDir - Root directory used to derive component names
 * @returns {Array.<{htmlPath: string, cssPath: string, jsPath: string|null, label: string, componentName: string}>} File pairs
 */
function findComponentPairs(dir, rootDir = dir) {
    const pairs = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            pairs.push(...findComponentPairs(fullPath, rootDir));
        } else if (entry.name.endsWith('.html')) {
            const name = basename(entry.name, '.html');
            const cssPath = join(dir, `${name}.css`);
            if (existsSync(cssPath)) {
                const jsCandidate = join(dir, `${name}.js`);
                const jsPath = existsSync(jsCandidate) ? jsCandidate : null;
                const relDir = relative(rootDir, dir).replaceAll('\\', '/');
                const componentName = relDir ? `${relDir}/${name}` : name;
                pairs.push({ htmlPath: fullPath, cssPath, jsPath, label: name, componentName });
            }
        }
    }
    return pairs;
}

/**
 * Validate a set of CSS classes against a child component's context.
 * A class is valid if it appears in the child's HTML, CSS (any depth),
 * fw-dynamic-classes annotation, fw-external-classes annotation, or globalClasses.
 * @param {Set.<string>} classes - Classes to validate
 * @param {string} childName - Child component name, e.g. 'Console/Line'
 * @param {Map.<string, {htmlPath: string, cssPath: string, jsPath: string|null}>} registry - Component registry
 * @param {Set.<string>} globals - Global CSS class whitelist
 * @returns {Array.<string>} Violation messages (empty if all valid)
 */
function validateClassesInChildContext(classes, childName, registry, globals) {
    const childInfo = registry.get(childName);
    if (!childInfo) {
        return [`unknown component "${childName}" (not found in registry)`];
    }

    const childHtml = readFileSync(childInfo.htmlPath, 'utf-8');
    const childCss = readFileSync(childInfo.cssPath, 'utf-8');

    const childHtmlClasses = extractHtmlClasses(childHtml);
    const childCssClasses = extractCssClasses(childCss);
    const childDynamicClasses = extractAnnotation(childCss, 'fw-dynamic-classes');
    const childExternalClasses = extractAnnotation(childCss, 'fw-external-classes');
    const childComponents = extractChildComponents(childInfo.jsPath);
    const childCssClassMap = new Map([...childComponents].map((n) => [toComponentCssClass(n), n]));

    const violations = [];
    for (const cls of classes) {
        if (childHtmlClasses.has(cls)) continue;
        if (childCssClasses.has(cls)) continue;
        if (childDynamicClasses.has(cls)) continue;
        if (childExternalClasses.has(cls)) continue;
        if (globals.has(cls)) continue;
        if (childCssClassMap.has(cls)) continue;
        violations.push(
            `"${cls}" (nested under .${toComponentCssClass(childName)}) ` +
                `is not present in ${childName}'s HTML or CSS, and is not declared in ` +
                `${childInfo.cssPath} via fw-dynamic-classes or fw-external-classes`,
        );
    }
    return violations;
}

/**
 * Check CSS class consistency across component HTML, CSS, and JS files.
 *
 * Four rules per component:
 *
 *   Rule 1 — HTML classes defined: every static class token in the HTML must be
 *   defined as a top-level selector in the component CSS, listed in globalClasses,
 *   or declared via fw-external-classes.
 *
 *   Rule 2 — CSS classes used: every top-level class selector in the CSS must
 *   appear as a static class token in the HTML, or be exempted via
 *   fw-external-classes, fw-dynamic-classes, or a createChild() scope.
 *
 *   Rule 3 — Nested CSS valid: classes nested inside a child component scope
 *   block must be valid in the child component's context.
 *
 *   Rule 4 — Annotation hygiene: fw-external-classes and fw-dynamic-classes
 *   must not list classes that are already in globalClasses. Global classes
 *   belong in .fusewire.json, not in per-component annotations.
 *
 * @param {string} componentDir - Absolute path to the component directory to scan
 * @param {import('./index.js').CheckConfig} config - Project-level configuration
 * @returns {Array.<import('./index.js').CheckViolation>} Violations found
 */
export function check(componentDir, config) {
    const globals = new Set(config.globalClasses ?? []);
    const pairs = findComponentPairs(componentDir);

    const componentRegistry = new Map();
    for (const pair of pairs) {
        componentRegistry.set(pair.componentName, pair);
    }

    const violations = [];

    for (const { htmlPath, cssPath, jsPath, componentName } of pairs) {
        const html = readFileSync(htmlPath, 'utf-8');
        const css = readFileSync(cssPath, 'utf-8');
        const label = relative(componentDir, htmlPath);
        const cssLabel = relative(componentDir, cssPath);

        const htmlClasses = extractHtmlClasses(html);
        const cssClasses = extractCssClasses(css);
        const nesting = extractCssNesting(css);
        const externalClasses = extractAnnotation(css, 'fw-external-classes');
        const dynamicClasses = extractAnnotation(css, 'fw-dynamic-classes');
        const childComponents = extractChildComponents(jsPath);
        const childCssClassMap = new Map(
            [...childComponents].map((n) => [toComponentCssClass(n), n]),
        );

        // Rule 1: HTML → CSS
        const htmlOnly = [];
        for (const cls of htmlClasses) {
            if (!cssClasses.has(cls) && !externalClasses.has(cls) && !globals.has(cls)) {
                htmlOnly.push(cls);
            }
        }
        if (htmlOnly.length > 0) {
            violations.push({
                file: htmlPath,
                message:
                    `${label}: HTML uses classes not defined in CSS: ${htmlOnly.join(', ')}\n` +
                    `Fix: add them to ${cssLabel}, or:\n` +
                    '  - For classes from a CSS framework (Bootstrap, Tailwind, etc.):\n' +
                    '      add to globalClasses in .fusewire.json\n' +
                    '  - For classes injected by a third-party widget at runtime (e.g. CodeMirror):\n' +
                    `      add to ${cssLabel}: /* fw-external-classes: ${htmlOnly.join(', ')} */\n` +
                    '      (use fw-external-classes only for true exceptions — framework\n' +
                    '      classes belong in globalClasses)',
            });
        }

        // Rule 2: CSS → HTML
        const cssOnly = [];
        for (const cls of cssClasses) {
            if (htmlClasses.has(cls)) continue;
            if (externalClasses.has(cls)) continue;
            if (dynamicClasses.has(cls)) continue;
            if (globals.has(cls)) continue;
            if (childCssClassMap.has(cls)) continue;
            cssOnly.push(cls);
        }
        if (cssOnly.length > 0) {
            violations.push({
                file: cssPath,
                message:
                    `${cssLabel}: CSS defines classes not used in HTML: ${cssOnly.join(', ')}\n` +
                    `Fix: remove from ${cssLabel}, or:\n` +
                    `  - For dynamically interpolated classes (e.g. class="log-((level))"):\n` +
                    `      add to ${cssLabel}: /* fw-dynamic-classes: ${cssOnly.join(', ')} */\n` +
                    '  - For classes scoped to a child component\'s elements:\n' +
                    `      nest them: .ChildName { .${cssOnly[0]} { ... } }\n` +
                    '      (the child must be declared via createChild() in the JS file)\n' +
                    '  - For classes injected by a third-party widget at runtime (e.g. CodeMirror):\n' +
                    `      add to ${cssLabel}: /* fw-external-classes: ${cssOnly.join(', ')} */\n` +
                    '      (use fw-external-classes only for true exceptions — framework\n' +
                    '      classes belong in globalClasses in .fusewire.json)',
            });
        }

        // Rule 4: Annotation hygiene — fw-* annotations must not list global classes
        const redundantExternal = [...externalClasses].filter((cls) => globals.has(cls));
        const redundantDynamic = [...dynamicClasses].filter((cls) => globals.has(cls));
        if (redundantExternal.length > 0) {
            violations.push({
                file: cssPath,
                message:
                    `${cssLabel}: fw-external-classes lists classes already in globalClasses: ${redundantExternal.join(', ')}\n` +
                    'Fix: remove them from the fw-external-classes annotation.\n' +
                    'Classes defined in .fusewire.json globalClasses do not need per-component annotations.',
            });
        }
        if (redundantDynamic.length > 0) {
            violations.push({
                file: cssPath,
                message:
                    `${cssLabel}: fw-dynamic-classes lists classes already in globalClasses: ${redundantDynamic.join(', ')}\n` +
                    'Fix: remove them from the fw-dynamic-classes annotation.\n' +
                    'Classes defined in .fusewire.json globalClasses do not need per-component annotations.',
            });
        }

        // Rule 3: Nested CSS → child context
        const nestedViolations = [];
        for (const [parentClass, nestedClasses] of nesting) {
            const childName = childCssClassMap.get(parentClass);
            if (!childName) continue;
            const childViolations = validateClassesInChildContext(
                nestedClasses,
                childName,
                componentRegistry,
                globals,
            );
            nestedViolations.push(...childViolations);
        }
        if (nestedViolations.length > 0) {
            violations.push({
                file: cssPath,
                message: `${cssLabel}: nested CSS class violations:\n${nestedViolations.map((v) => `  ${v}`).join('\n')}`,
            });
        }
    }

    return violations;
}
