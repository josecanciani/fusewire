import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ComponentReference } from '../src/component-reference.js';
import { ComponentId } from '../src/component-id.js';
import { Component } from '../src/component.js';
import { COMPONENT_ID, EVENTS } from '../src/symbols.js';
import { EventEmitter } from '../src/event-emitter.js';

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

    describe('_options', () => {
        it('defaults to empty object', () => {
            const ref = new ComponentReference('App');
            assert.deepStrictEqual(ref._options, {});
        });

        it('stores fallback option', () => {
            const ref = new ComponentReference('App', '', {}, null, { fallback: 'ErrorCard' });
            assert.strictEqual(ref._options.fallback, 'ErrorCard');
        });

        it('stores lazy option', () => {
            const ref = new ComponentReference('App', '', {}, null, { lazy: true });
            assert.strictEqual(ref._options.lazy, true);
        });

        it('stores placeholder option', () => {
            const ref = new ComponentReference('App', '', {}, null, { placeholder: 'Skeleton' });
            assert.strictEqual(ref._options.placeholder, 'Skeleton');
        });
    });

    describe('eager creation fields', () => {
        it('_creationPromise defaults to null', () => {
            const ref = new ComponentReference('App');
            assert.strictEqual(ref._creationPromise, null);
        });

        it('_detachedContainer defaults to null', () => {
            const ref = new ComponentReference('App');
            assert.strictEqual(ref._detachedContainer, null);
        });

        it('_creationError defaults to null', () => {
            const ref = new ComponentReference('App');
            assert.strictEqual(ref._creationError, null);
        });
    });

    describe('on() — buffered event subscriptions', () => {
        it('buffers a subscription', () => {
            const ref = new ComponentReference('Child', 'c1');
            ref.on('click', () => {});
            assert.strictEqual(ref._bufferedEvents.length, 1);
            assert.strictEqual(ref._bufferedEvents[0].eventName, 'click');
        });

        it('buffers multiple subscriptions', () => {
            const ref = new ComponentReference('Child', 'c1');
            ref.on('click', () => {});
            ref.on('hover', () => {});
            assert.strictEqual(ref._bufferedEvents.length, 2);
        });

        it('returns an unsubscribe function', () => {
            const ref = new ComponentReference('Child', 'c1');
            const unsub = ref.on('click', () => {});
            assert.strictEqual(typeof unsub, 'function');
        });

        it('marks entry as removed when unsubscribed before replay', () => {
            const ref = new ComponentReference('Child', 'c1');
            const unsub = ref.on('click', () => {});
            unsub();
            assert.strictEqual(ref._bufferedEvents[0].removed, true);
        });

        it('throws when called on a replaced reference', () => {
            const ref = new ComponentReference('Child', 'c1');
            ref._replaced = true;
            assert.throws(
                () => ref.on('click', () => {}),
                /on\(\) called on replaced reference/,
            );
        });
    });

    describe('_replayBufferedEvents()', () => {
        /**
         * Create a minimal Component with event emitter wired up
         * @returns {Component} A component ready to accept .on() calls
         */
        function makeComponent() {
            const comp = new Component();
            comp[COMPONENT_ID] = new ComponentId('Child', 'c1');
            comp[EVENTS] = new EventEmitter();
            return comp;
        }

        it('replays buffered subscriptions onto the real component', () => {
            const ref = new ComponentReference('Child', 'c1');
            const calls = [];
            ref.on('click', () => calls.push('clicked'));

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            comp.emit('click');
            assert.deepStrictEqual(calls, ['clicked']);
        });

        it('skips removed subscriptions', () => {
            const ref = new ComponentReference('Child', 'c1');
            const calls = [];
            const unsub = ref.on('click', () => calls.push('clicked'));
            unsub();

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            comp.emit('click');
            assert.deepStrictEqual(calls, []);
        });

        it('clears buffered events after replay', () => {
            const ref = new ComponentReference('Child', 'c1');
            ref.on('click', () => {});

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            assert.strictEqual(ref._bufferedEvents.length, 0);
        });

        it('unsubscribe works after replay (delegates to real component)', () => {
            const ref = new ComponentReference('Child', 'c1');
            const calls = [];
            const unsub = ref.on('click', () => calls.push('clicked'));

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            comp.emit('click');
            assert.deepStrictEqual(calls, ['clicked']);

            unsub();
            comp.emit('click');
            assert.deepStrictEqual(calls, ['clicked'], 'no second call after unsub');
        });

        it('replays multiple events in order', () => {
            const ref = new ComponentReference('Child', 'c1');
            const calls = [];
            ref.on('a', () => calls.push('a'));
            ref.on('b', () => calls.push('b'));

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            comp.emit('a');
            comp.emit('b');
            assert.deepStrictEqual(calls, ['a', 'b']);
        });

        it('passes event arguments through', () => {
            const ref = new ComponentReference('Child', 'c1');
            const calls = [];
            ref.on('select', (name, idx) => calls.push({ name, idx }));

            const comp = makeComponent();
            ref._replayBufferedEvents(comp);

            comp.emit('select', 'foo', 42);
            assert.deepStrictEqual(calls, [{ name: 'foo', idx: 42 }]);
        });
    });
});
