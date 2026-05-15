import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { extractOpeningTags } from "../src/template-parser.js";

export const name = "template-vars";

/**
 * Recursively find all .html files under a directory tree.
 * @param {string} dir - Directory to scan
 * @param {string} rootDir - Root directory used to derive component names
 * @returns {Array.<{htmlPath: string, jsPath: string|null, label: string, componentName: string}>} HTML files
 */
function findComponentFiles(dir, rootDir = dir) {
    const files = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findComponentFiles(fullPath, rootDir));
        } else if (entry.name.endsWith(".html")) {
            const name = basename(entry.name, ".html");
            const jsCandidate = join(dir, `${name}.js`);
            const jsPath = existsSync(jsCandidate) ? jsCandidate : null;
            const relDir = relative(rootDir, dir).replaceAll("\\", "/");
            const componentName = relDir ? `${relDir}/${name}` : name;
            files.push({
                htmlPath: fullPath,
                jsPath,
                label: name,
                componentName,
            });
        }
    }
    return files;
}

/**
 * Extract variable paths from a template (interpolations and directives).
 * @param {string} html - HTML content
 * @returns {{vars: Set.<string>, locals: Set.<string>}} Variables and local loop variables found
 */
function extractTemplateVars(html) {
    const vars = new Set();
    const locals = new Set();

    // 1. Directives fw-if, fw-each (do this first to find locals)
    const openingTags = extractOpeningTags(html);
    for (const { tagName, attrs } of openingTags) {
        const ifAttr = attrs.find((a) => a.name === "fw-if");
        if (ifAttr && ifAttr.value) {
            const path = ifAttr.value.trim().startsWith("!")
                ? ifAttr.value.trim().slice(1)
                : ifAttr.value.trim();
            vars.add(path);
        }
        const eachAttr = attrs.find((a) => a.name === "fw-each");
        if (eachAttr && eachAttr.value) {
            const eachMatch = eachAttr.value.match(
                /^\s*([\w$]+)\s+in\s+([\w.$]+)\s*$/,
            );
            if (eachMatch) {
                vars.add(eachMatch[2]);
                locals.add(eachMatch[1]);
            }
        }

        // Handle fw-each tag syntax (as an element)
        if (tagName === "fw-each") {
            const itemAttr = attrs.find((a) => a.name === "item");
            const inAttr = attrs.find((a) => a.name === "in");
            if (itemAttr && itemAttr.value && inAttr && inAttr.value) {
                vars.add(inAttr.value.trim());
                locals.add(itemAttr.value.trim());
            }
        }
    }

    // 2. Interpolations ((path))
    const interpRegex = /\(\(([^()]*)\)\)/g;
    let match;
    while ((match = interpRegex.exec(html)) !== null) {
        const path = match[1].trim();
        if (
            path &&
            path !== "this" &&
            path !== "componentId" &&
            path !== "componentName" &&
            path !== "componentVersion"
        ) {
            vars.add(path);
        }
    }

    return { vars, locals };
}

/**
 * Extract public variable names and getters from a JS source.
 * @param {string} jsSource - JS source code
 * @returns {Set.<string>} Public variable names and getters
 */
function extractJsVars(jsSource) {
    const vars = new Set();

    // Simple state machine to find class bodies and extract members
    const lines = jsSource.split("\n");
    let inClass = false;
    let depth = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inClass) {
            if (/class\s+\w+/.test(trimmed)) {
                inClass = true;
                depth =
                    (trimmed.match(/\{/g) ?? []).length -
                    (trimmed.match(/\}/g) ?? []).length;
            }
            continue;
        }

        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;

        if (depth === 1) {
            // Public fields: name = value; or name;
            const fieldMatch = trimmed.match(/^([\w$]+)\s*[=;]/);
            if (fieldMatch) {
                const name = fieldMatch[1];
                if (!name.startsWith("_") && !name.startsWith("#")) {
                    vars.add(name);
                }
            }

            // Getters: get name() {
            const getterMatch = trimmed.match(/^get\s+([\w$]+)\s*\(/);
            if (getterMatch) {
                const name = getterMatch[1];
                if (!name.startsWith("_") && !name.startsWith("#")) {
                    vars.add(name);
                }
            }
        }

        depth += opens;
        depth -= closes;

        if (depth <= 0) {
            inClass = false;
            depth = 0;
        }
    }

    return vars;
}

/**
 * Check that all variables used in HTML templates exist in the component JS.
 * @param {string} componentDir - Absolute path to scan
 * @param {import('./index.js').CheckConfig} _config - Config
 * @returns {Array.<import('./index.js').CheckViolation>} Violations
 */
export function check(componentDir, _config) {
    const files = findComponentFiles(componentDir);
    const violations = [];

    for (const { htmlPath, jsPath, componentName } of files) {
        if (!jsPath) continue; // Skip if no JS file (might be a pure template component, though FuseWire usually has both)

        const html = readFileSync(htmlPath, "utf-8");
        const js = readFileSync(jsPath, "utf-8");
        const label = relative(componentDir, htmlPath);

        const { vars: templateVars, locals } = extractTemplateVars(html);
        const jsVars = extractJsVars(js);

        const missing = [];
        for (const varPath of templateVars) {
            const rootVar = varPath.split(".")[0];
            if (!jsVars.has(rootVar) && !locals.has(rootVar)) {
                missing.push(rootVar);
            }
        }

        if (missing.length > 0) {
            violations.push({
                file: htmlPath,
                message:
                    `${label}: template uses variables not defined in ${basename(jsPath)}: ${Array.from(new Set(missing)).join(", ")}\n` +
                    `Fix: define them as public class fields or getters in ${basename(jsPath)}.`,
            });
        }
    }

    return violations;
}
