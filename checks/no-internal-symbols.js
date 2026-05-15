import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'no-internal-symbols';

/**
 * Validates that component files do not import internal symbols (symbols.js).
 * @param {string} componentDir - Absolute path to the component directory to scan
 * @param {import('./index.js').CheckConfig} config - Project-level configuration
 * @returns {Array.<import('./index.js').CheckViolation>} Violations found
 */
export function check(componentDir, config) {
    const violations = [];

    function scan(dir) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.name.endsWith('.js')) {
                const code = readFileSync(fullPath, 'utf8');
                if (/from\s+['"].*symbols\.js['"]/.test(code)) {
                    // Exception for demo and dev tools that need to hook into the framework
                    const isAllowed = fullPath.includes('/Playground/') || fullPath.includes('/Console/');
                    if (!isAllowed) {
                        violations.push({
                            file: relative(componentDir, fullPath),
                            message: 'Component files must not import internal symbols from symbols.js',
                        });
                    }
                }
            }
        }
    }

    scan(componentDir);
    return violations;
}
