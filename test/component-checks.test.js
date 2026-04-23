import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllChecks } from '../checks/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read project-level global CSS classes from package.json fusewire config.
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const globalClasses = pkg.fusewire?.globalClasses ?? [];

const componentDir = join(__dirname, '../htdocs/components');

/**
 * Component Quality Checks — runs every check in checks/ against htdocs/components/.
 *
 * This test uses runAllChecks() exactly as a consumer project would.
 * Adding a new .js file to checks/ automatically adds a new test here.
 */
describe('Component Quality Checks', () => {
    it('all checks pass', async () => {
        const results = await runAllChecks(componentDir, { globalClasses });
        const failures = results.filter((r) => r.violations.length > 0);
        if (failures.length > 0) {
            const msg = failures
                .flatMap((r) => r.violations.map((v) => `[${r.name}] ${v.message}`))
                .join('\n\n');
            assert.fail(msg);
        }
    });
});
