import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../checks/template-syntax.js';

describe('template-syntax check', () => {
    let tmpDir;

    before(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'fusewire-test-'));
    });

    after(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns a violation for invalid fw-if syntax', () => {
        const componentDir = join(tmpDir, 'TestComponent');
        mkdirSync(componentDir);
        
        const htmlContent = `
            <div>
                <span fw-if="step === 1">Invalid if</span>
            </div>
        `;
        writeFileSync(join(componentDir, 'Invalid.html'), htmlContent);

        const violations = check(componentDir, {});
        
        assert.strictEqual(violations.length, 1);
        assert.match(violations[0].message, /invalid fw-if syntax: "step === 1"/);
        assert.match(violations[0].message, /Do not use spaces, comparison operators/);
    });

    it('passes for valid fw-if syntax', () => {
        const componentDir = join(tmpDir, 'ValidComponent');
        mkdirSync(componentDir);
        
        const htmlContent = `
            <div>
                <span fw-if="!user.isLoggedIn">Valid negated</span>
                <span fw-if="$isStep1">Valid with dollar sign</span>
                <span fw-if="config.isActive">Valid nested</span>
            </div>
        `;
        writeFileSync(join(componentDir, 'Valid.html'), htmlContent);

        const violations = check(componentDir, {});
        
        assert.strictEqual(violations.length, 0);
    });
});
