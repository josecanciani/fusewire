import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Architecture & Dependencies', () => {
    it('Core framework files in src/ must not reference htdocs/ example components', async () => {
        const srcPath = new URL('../src', import.meta.url).pathname;
        const htdocsComponentsPath = new URL('../htdocs/components', import.meta.url).pathname;

        // Find all example component folders to build a list of forbidden names
        const exampleFolders = [];
        const dirEntries = await fs.readdir(htdocsComponentsPath, { withFileTypes: true });
        for (const entry of dirEntries) {
            if (entry.isDirectory() && entry.name !== 'FuseWire') {
                exampleFolders.push(entry.name);
            }
        }

        async function walk(dir) {
            let results = [];
            const list = await fs.readdir(dir);
            for (let file of list) {
                file = path.resolve(dir, file);
                const stat = await fs.stat(file);
                if (stat && stat.isDirectory()) {
                    results = results.concat(await walk(file));
                } else if (file.endsWith('.js')) {
                    results.push(file);
                }
            }
            return results;
        }

        const srcFiles = await walk(srcPath);

        const violations = [];
        for (const file of srcFiles) {
            const content = await fs.readFile(file, 'utf-8');
            for (const folder of exampleFolders) {
                // If a framework file contains the literal name of an example folder followed by a slash
                // (e.g. 'Lazy/' or 'GameOfLife/'), it's likely a violation of the boundary.
                if (content.includes(`'${folder}/`) || content.includes(`"${folder}/`) || content.includes(folder + '/')) {
                    // Check if it's just a comment using regex
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (line.includes(`${folder}/`) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                            violations.push(`${path.basename(file)}:${index + 1} contains reference to example component folder "${folder}/": ${line.trim()}`);
                        }
                    });
                }

                // Specific check for LazyLoading without folder prefix just in case
                if (content.includes('LazyLoading')) {
                    violations.push(`${path.basename(file)} contains reference to "LazyLoading"`);
                }
            }
        }

        if (violations.length > 0) {
            assert.fail(
                'Framework files in src/ must not depend on or reference example components from htdocs/.\n' +
                'Violations found:\n' + violations.join('\n')
            );
        }
    });
});
