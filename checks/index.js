import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} CheckViolation
 * @property {string} file - Absolute path to the file with the violation
 * @property {string} message - Human-readable description of the violation with fix instructions
 */

/**
 * @typedef {object} CheckResult
 * @property {string} name - Check identifier (e.g. 'no-style-tags')
 * @property {Array.<CheckViolation>} violations - Violations found by this check
 */

/**
 * Configuration for component checks.
 * @typedef {object} CheckConfig
 * @property {Array.<string>} [globalClasses] - CSS class names available globally (e.g. Bootstrap utilities)
 * @property {Array.<string>} [disabledChecks] - Check names to skip (e.g. ['var-jsdoc'])
 */

/**
 * Discover and run all component checks in this directory.
 *
 * Each sibling .js file that exports a `check` function and a `name` string
 * is treated as a check module. New checks are picked up automatically —
 * no manifest or registration needed.
 *
 * @param {string} componentDir - Absolute path to the component directory to scan
 * @param {CheckConfig} config - Project-level configuration
 * @returns {Promise.<Array.<CheckResult>>} Results per check
 */
export async function runAllChecks(componentDir, config = {}) {
    const disabled = new Set(config.disabledChecks ?? []);
    const files = readdirSync(__dirname)
        .filter((f) => f.endsWith('.js') && f !== 'index.js')
        .sort();

    const results = [];
    for (const file of files) {
        const mod = await import(join(__dirname, file));
        if (disabled.has(mod.name)) continue;
        const violations = mod.check(componentDir, config);
        results.push({ name: mod.name, violations });
    }
    return results;
}
