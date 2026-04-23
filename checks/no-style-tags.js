import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'no-style-tags';

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
 * Check that component HTML files do not contain inline style tags.
 *
 * Component styles belong in the colocated .css file, not in the HTML template.
 * Inline style tags break the framework's scoped CSS model and cannot be
 * statically analyzed by other checks (e.g. css-class-consistency).
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
        const lines = content.split('\n');
        const label = relative(componentDir, file);

        for (let i = 0; i < lines.length; i++) {
            if (/<style[\s>]/i.test(lines[i])) {
                violations.push({
                    file,
                    message:
                        `${label}:${i + 1} contains a <style> tag.\n` +
                        'Component styles must be defined in the colocated .css file, not inline in the HTML template.\n' +
                        `Fix: move the styles to ${label.replace('.html', '.css')}`,
                });
            }
        }
    }

    return violations;
}
