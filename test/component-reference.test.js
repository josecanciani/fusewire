import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ComponentReference } from '../src/component-reference.js';
import { ComponentId } from '../src/component-id.js';

describe('ComponentReference', () => {
    describe('constructor', () => {
        it('creates with all arguments', () => {
            const ref = new ComponentReference('UserList', 'main', { page: 1 }, '2.0');
            assert.strictEqual(ref.componentName, 'UserList');
            assert.strictEqual(ref.id, 'main');
            assert.deepStrictEqual(ref.vars, { page: 1 });
            assert.strictEqual(ref.version, '2.0');
        });

        it('creates with defaults', () => {
            const ref = new ComponentReference('Counter');
            assert.strictEqual(ref.componentName, 'Counter');
            assert.strictEqual(ref.id, '');
            assert.deepStrictEqual(ref.vars, {});
            assert.strictEqual(ref.version, null);
        });

        it('stores componentName', () => {
            const ref = new ComponentReference('Dashboard');
            assert.strictEqual(ref.componentName, 'Dashboard');
        });

        it('stores id', () => {
            const ref = new ComponentReference('Widget', 'sidebar');
            assert.strictEqual(ref.id, 'sidebar');
        });

        it('stores vars', () => {
            const vars = { color: 'red', size: 42 };
            const ref = new ComponentReference('Theme', '', vars);
            assert.deepStrictEqual(ref.vars, { color: 'red', size: 42 });
        });

        it('stores version', () => {
            const ref = new ComponentReference('App', '', {}, '1.0.0');
            assert.strictEqual(ref.version, '1.0.0');
        });
    });

    describe('validation', () => {
        it('throws if componentName is empty', () => {
            assert.throws(
                () => new ComponentReference(''),
                /componentName must be a non-empty string/,
            );
        });

        it('throws if componentName is not a string', () => {
            assert.throws(
                () => new ComponentReference(null),
                /componentName must be a non-empty string/,
            );
        });
    });

    describe('toComponentId', () => {
        it('returns a ComponentId with correct name and id', () => {
            const ref = new ComponentReference('UserList', 'main');
            const cid = ref.toComponentId();
            assert.ok(cid instanceof ComponentId);
            assert.strictEqual(cid.name, 'UserList');
            assert.strictEqual(cid.id, 'main');
        });

        it('handles empty id', () => {
            const ref = new ComponentReference('Counter');
            const cid = ref.toComponentId();
            assert.ok(cid instanceof ComponentId);
            assert.strictEqual(cid.name, 'Counter');
            assert.strictEqual(cid.id, '');
        });
    });

    describe('version', () => {
        it('defaults to null', () => {
            const ref = new ComponentReference('App');
            assert.strictEqual(ref.version, null);
        });

        it('stores string version', () => {
            const ref = new ComponentReference('App', '', {}, '3.2.1');
            assert.strictEqual(ref.version, '3.2.1');
        });
    });

    describe('update()', () => {
        it('shallow-merges newVars into vars', () => {
            const ref = new ComponentReference('Counter', 'c1', { a: 1, b: 2 });
            ref.update({ b: 99, c: 3 });
            assert.deepStrictEqual(ref.vars, { a: 1, b: 99, c: 3 });
        });

        it('throws when called on a replaced reference', () => {
            const ref = new ComponentReference('Counter', 'c1', { a: 1 });
            ref._replaced = true;
            assert.throws(
                () => ref.update({ a: 2 }),
                /update\(\) called on replaced reference/,
            );
        });

        it('does not modify vars when replaced reference throws', () => {
            const ref = new ComponentReference('Counter', 'c1', { a: 1 });
            ref._replaced = true;
            try { ref.update({ a: 2 }); } catch { /* expected */ }
            assert.strictEqual(ref.vars.a, 1);
        });
    });

    describe('_replaced flag', () => {
        it('defaults to false', () => {
            const ref = new ComponentReference('App');
            assert.strictEqual(ref._replaced, false);
        });
    });
});
