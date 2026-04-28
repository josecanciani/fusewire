#!/usr/bin/env node

/**
 * CLI runner for FuseWire component quality checks.
 *
 * Usage:
 *   node checks/run.js <componentDir> [componentName]
 *
 * Arguments:
 *   componentDir   Path to the root component directory to scan
 *   componentName  Optional component name to check (e.g. "Console/Line").
 *                  When provided, checks still scan the full tree (for
 *                  cross-component validation) but only report violations
 *                  from the specified component's files.
 *
 * The script reads project configuration from the working directory's
 * .fusewire.json file:
 *   - globalClasses  {Array.<string>}  CSS classes available globally
 *   - disabledChecks {Array.<string>}  Check names to skip
 *
 * Exit codes:
 *   0 — all checks pass (or no violations for the filtered component)
 *   1 — one or more violations found
 *   2 — usage error (missing arguments, bad paths)
 */

import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { runAllChecks } from "./index.js";

const arg1 = process.argv[2];
const arg2 = process.argv[3];

if (!arg1) {
    console.error("Usage: fusewire-checks <componentDir> [componentName]");
    console.error("");
    console.error("  <componentDir>    Path to the root component directory");
    console.error(
        '  [componentName]   Optional component to check (e.g. "Console/Line")',
    );
    console.error("");
    console.error("Examples:");
    console.error("  node checks/run.js ./src/components");
    console.error("  node checks/run.js ./src/components Console/Line");
    process.exit(2);
}

/**
 * Recursively find all components (unique base names) in a directory.
 * @param {string} dir - Directory to scan
 * @returns {Set.<string>} Set of absolute paths to components (without extension)
 */
function findComponents(dir) {
    const components = new Set();
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            const sub = findComponents(fullPath);
            for (const s of sub) components.add(s);
        } else if (entry.name.endsWith(".html") || entry.name.endsWith(".js")) {
            const baseName = fullPath.replace(/\.(html|js)$/, "");
            components.add(baseName);
        }
    }
    return components;
}

/**
 * Resolve the component directory and optional component name from CLI args.
 *
 * Accepts two forms:
 *   1. <dir>                       — scan entire directory
 *   2. <dir> <name>                — scan dir, filter to component name
 *
 * When only one argument is given and it does not resolve to a directory,
 * the runner checks whether sibling .js or .html files exist. If so, the
 * argument is treated as a component path: the directory root is derived
 * by stripping the component name segments, and the component name is
 * extracted from the relative path.
 *
 * @returns {{componentDir: string, componentName: string|null}} Resolved paths
 */
function resolveArgs() {
    const resolvedArg1 = resolve(arg1);

    // Two-argument form: <componentDir> <componentName>
    if (arg2) {
        if (
            !existsSync(resolvedArg1) ||
            !statSync(resolvedArg1).isDirectory()
        ) {
            console.error(`Component directory not found: ${resolvedArg1}`);
            process.exit(2);
        }
        const componentPath = join(resolvedArg1, arg2);
        if (
            !existsSync(`${componentPath}.html`) &&
            !existsSync(`${componentPath}.js`)
        ) {
            console.error(
                `Component not found: ${arg2} (looked for ${componentPath}.html and ${componentPath}.js)`,
            );
            process.exit(2);
        }
        return { componentDir: resolvedArg1, componentName: arg2 };
    }

    // Single argument: is it a directory?
    if (existsSync(resolvedArg1) && statSync(resolvedArg1).isDirectory()) {
        return { componentDir: resolvedArg1, componentName: null };
    }

    // Single argument, not a directory: treat as component path.
    // E.g. "./src/components/Console/Line" → dir="./src/components", name="Console/Line"
    if (
        existsSync(`${resolvedArg1}.html`) ||
        existsSync(`${resolvedArg1}.js`)
    ) {
        // Walk up to find the component root. The component root is the
        // deepest ancestor directory that is NOT a component namespace
        // (i.e. it contains subdirectories with component files).
        // Heuristic: walk up from the component's parent directory. The root
        // is the directory the user would pass for a full scan. Since we can't
        // know that reliably, use the component's grandparent. For deeply nested
        // components (A/B/C), this still works because we only use the root for
        // the registry and label computation.
        const parts = resolvedArg1.split("/");
        const fileName = parts.pop();
        const parentDir = parts.join("/");
        const grandparentDir = parts.slice(0, -1).join("/");

        // Try grandparent first (covers Namespace/Component pattern)
        if (
            existsSync(grandparentDir) &&
            statSync(grandparentDir).isDirectory()
        ) {
            const parentName = parentDir.split("/").pop();
            return {
                componentDir: grandparentDir,
                componentName: `${parentName}/${fileName}`,
            };
        }

        // Fallback: component is at the root level (no namespace)
        return { componentDir: parentDir, componentName: fileName };
    }

    console.error(`Not found: ${resolvedArg1}`);
    console.error(
        "Argument must be a component directory or a component path (without extension).",
    );
    process.exit(2);
}

/**
 * Read fusewire configuration from the working directory's .fusewire.json.
 * @returns {import('./index.js').CheckConfig} Config extracted from .fusewire.json
 */
function readProjectConfig() {
    const configPath = join(process.cwd(), ".fusewire.json");
    if (!existsSync(configPath)) return {};

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
        globalClasses: config.globalClasses ?? [],
        disabledChecks: config.disabledChecks ?? [],
    };
}

/**
 * Run all checks, optionally filtering to a single component, and report.
 */
async function main() {
    const { componentDir, componentName } = resolveArgs();
    const config = readProjectConfig();
    const results = await runAllChecks(componentDir, config);

    // When a component name is specified, filter violations to only those
    // whose file path belongs to that component.
    if (componentName) {
        const prefix = join(componentDir, componentName);
        for (const result of results) {
            result.violations = result.violations.filter((v) =>
                v.file.startsWith(prefix),
            );
        }
    }

    const failures = results.filter((r) => r.violations.length > 0);
    const componentCount = componentName
        ? 1
        : findComponents(componentDir).size;

    if (failures.length === 0) {
        const checkCount = results.length;
        const scope = componentName ?? "all components";
        const componentLabel =
            componentCount === 1 ? "component" : "components";
        console.log(
            `All ${checkCount} checks passed across ${componentCount} ${componentLabel} (${scope}).`,
        );
        process.exit(0);
    }

    for (const result of failures) {
        console.error(`--- ${result.name} ---`);
        for (const v of result.violations) {
            console.error(v.message);
            console.error("");
        }
    }

    const violationCount = failures.reduce(
        (sum, r) => sum + r.violations.length,
        0,
    );
    const componentLabel = componentCount === 1 ? "component" : "components";
    console.error(
        `${violationCount} violation(s) found across ${componentCount} ${componentLabel} and ${failures.length} check(s).`,
    );
    process.exit(1);
}

main();
