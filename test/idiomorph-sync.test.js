import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Idiomorph library files are in sync with node_modules', async () => {
    const vendoredPath = path.join(__dirname, '../src/lib/idiomorph/idiomorph.esm.js');
    const nodeModulesPath = path.join(__dirname, '../node_modules/idiomorph/dist/idiomorph.esm.js');

    // Check both files exist
    assert.ok(fs.existsSync(vendoredPath), 'Vendored idiomorph.esm.js should exist');
    assert.ok(fs.existsSync(nodeModulesPath), 'node_modules idiomorph.esm.js should exist');

    // Compare file contents
    const vendoredContent = fs.readFileSync(vendoredPath, 'utf-8');
    const nodeModulesContent = fs.readFileSync(nodeModulesPath, 'utf-8');

    assert.strictEqual(
        vendoredContent,
        nodeModulesContent,
        'Vendored idiomorph.esm.js is out of sync with node_modules. ' +
        'Run: cp node_modules/idiomorph/dist/idiomorph.esm.js src/lib/idiomorph/'
    );
});

test('Idiomorph package.json version matches', async () => {
    const vendoredPkgPath = path.join(__dirname, '../src/lib/idiomorph/package.json');
    const nodeModulesPkgPath = path.join(__dirname, '../node_modules/idiomorph/package.json');

    // Check both files exist
    assert.ok(fs.existsSync(vendoredPkgPath), 'Vendored package.json should exist');
    assert.ok(fs.existsSync(nodeModulesPkgPath), 'node_modules package.json should exist');

    // Compare versions
    const vendoredPkg = JSON.parse(fs.readFileSync(vendoredPkgPath, 'utf-8'));
    const nodeModulesPkg = JSON.parse(fs.readFileSync(nodeModulesPkgPath, 'utf-8'));

    assert.strictEqual(
        vendoredPkg.version,
        nodeModulesPkg.version,
        `Vendored idiomorph version (${vendoredPkg.version}) does not match node_modules (${nodeModulesPkg.version}). ` +
        'Run: cp node_modules/idiomorph/package.json src/lib/idiomorph/ && node -e "const f=\'src/lib/idiomorph/package.json\',p=JSON.parse(require(\'fs\').readFileSync(f));p.type=\'module\';require(\'fs\').writeFileSync(f,JSON.stringify(p,null,2)+\'\\n\')"'
    );
});

test('Vendored idiomorph package.json has "type": "module"', () => {
    const vendoredPkgPath = path.join(__dirname, '../src/lib/idiomorph/package.json');

    const vendoredPkg = JSON.parse(fs.readFileSync(vendoredPkgPath, 'utf-8'));

    assert.strictEqual(
        vendoredPkg.type,
        'module',
        'Vendored idiomorph package.json must have "type": "module" to avoid a ' +
        'MODULE_TYPELESS_PACKAGE_JSON Node.js warning. The upstream package does not include ' +
        'this field, so it must be added manually after copying: ' +
        'add \'"type": "module"\' to src/lib/idiomorph/package.json'
    );
});
