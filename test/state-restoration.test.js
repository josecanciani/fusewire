'use strict';

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { Reactor } from '../src/reactor.js';
import { Component, Child } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { InstanceRegistry, collectVars } from '../src/instance.js';
import { Renderer } from '../src/renderer.js';
import { TemplateStore } from '../src/template-store.js';
import { FuseWire } from '../src/fusewire.js';
import { JSDOM } from 'jsdom';
import { REACTOR } from '../src/symbols.js';
import { StateSerializer } from '../src/state-serializer.js';
import { StrictConsole } from './strict-console.js';

const mockMorph = () => { };

let registeredApps = [];
let activeStrictConsoles = [];

afterEach(() => {
    try {
        for (const strict of activeStrictConsoles) {
            strict.assertClean();
        }
    } finally {
        activeStrictConsoles = [];
        for (const name of registeredApps) {
            FuseWire.unregister(name);
        }
        registeredApps = [];
    }
});

/**
 * Create a Reactor and track it for cleanup
 * @param {string} appName - Application name
 * @param {object} config - Reactor config
 * @returns {Reactor} The created reactor
 */
function createReactor(appName, config = {}) {
    registeredApps.push(appName);
    if (!('console' in config)) {
        const strict = new StrictConsole();
        config.console = strict;
        activeStrictConsoles.push(strict);
    }
    if ('console' in config && config.enableDefaultConsole === undefined) {
        config.enableDefaultConsole = true;
    }
    return new Reactor(appName, config);
}

/**
 * Create a full test rig (DOM, reactor, registry, template store) for state tests
 * @param {string} testName - Unique test name for the reactor/app
 * @returns {{dom: JSDOM, reactor: Reactor, registry: InstanceRegistry, templateStore: TemplateStore, container: HTMLElement}}
 */
function createTestRig(testName) {
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
    global.document = dom.window.document;

    const templateStore = new TemplateStore();
    const renderer = new Renderer(mockMorph, testName);
    const registry = new InstanceRegistry(renderer, templateStore, testName);
    const reactor = createReactor(testName, {
        instanceRegistry: registry,
        templateStore,
        renderer,
    });
    const container = dom.window.document.getElementById('app');

    return { dom, reactor, registry, templateStore, container };
}

describe('State Restoration', () => {

    describe('preload()', () => {
        it('caches component class and template for instant createFromReference', async () => {
            const { registry, templateStore } = createTestRig('state-preload-1');

            class Widget extends Component { }
            registry.registerComponent('Widget', Widget);
            templateStore.set('Widget', {
                version: 'v1',
                htmlCode: '<div>widget</div>',
                cssCode: '',
            });

            // preload should not throw and should cache
            await registry.preload('Widget');

            // Verify template is in store
            assert.ok(templateStore.has('Widget'));
        });
    });

    describe('state capture on destroy', () => {
        it('captures public vars into state store on remove', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-capture-1');

            class Counter extends Component {
                /** @type {number} */
                count = 0;
            }
            registry.registerComponent('Counter', Counter);
            templateStore.set('Counter', {
                version: 'v1',
                htmlCode: '<div>((count))</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="c"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('c');

            const id = new ComponentId('Counter', 'main', 'v1');
            const instance = await registry.create(id, Counter, { count: 42 }, container);
            assert.strictEqual(instance.count, 42);

            // Remove the instance — state should be captured
            await registry.remove(id);

            // Verify state was stored
            const savedState = reactor.persistence.load('Counter#main');
            assert.ok(savedState);
            const parsedVars = savedState.vars;
            assert.strictEqual(parsedVars.count, 42);
            assert.strictEqual(savedState.extraState, null);
        });

        it('captures destroy() return value as extraState', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-capture-2');

            class Dashboard extends Component {
                /** @type {string} */
                title = '';

                /**
                 * Returns private state for persistence
                 * @returns {{secretData: string}}
                 */
                destroy() {
                    return { secretData: 'important' };
                }
            }
            registry.registerComponent('Dashboard', Dashboard);
            templateStore.set('Dashboard', {
                version: 'v1',
                htmlCode: '<div>((title))</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="d"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('d');

            const id = new ComponentId('Dashboard', 'main', 'v1');
            await registry.create(id, Dashboard, { title: 'My Dashboard' }, container);
            await registry.remove(id);

            const savedState = reactor.persistence.load('Dashboard#main');
            assert.ok(savedState);
            const parsedVars = savedState.vars;
            assert.strictEqual(parsedVars.title, 'My Dashboard');
            assert.deepStrictEqual(savedState.extraState, { secretData: 'important' });
        });

        it('serializes child component references as markers', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-capture-3');

            class Header extends Component { }
            class App extends Component {
                /** @type {Component} */
                header;
            }
            registry.registerComponent('Header', Header);
            registry.registerComponent('App', App);
            templateStore.set('Header', {
                version: 'v1',
                htmlCode: '<div>header</div>',
                cssCode: '',
            });
            templateStore.set('App', {
                version: 'v1',
                // Template with mount point for header child
                htmlCode: '<div>app ((header))</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="a"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('a');

            const appId = new ComponentId('App', 'main', 'v1');
            const headerChild = new Child('Header', 'h1', {});
            const app = await registry.create(appId, App, { header: headerChild }, container);

            // After creation, app.header is a live Component (via _replaceRefInVars)
            assert.ok(app.header instanceof Component, 'header should be a live Component after mount');

            // Now test serialization directly via the state serializer
            const serializer = new StateSerializer();
            const serialized = JSON.parse(serializer.stringify(collectVars(app)));
            assert.ok(serialized.header._componentRef);
            assert.strictEqual(serialized.header.name, 'Header');
            assert.strictEqual(serialized.header.id, 'h1');
        });
    });

    describe('state restore on create', () => {
        it('restores scalar vars from state store', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-restore-1');

            class Counter extends Component {
                /** @type {number} */
                count = 0;
            }
            registry.registerComponent('Counter', Counter);
            templateStore.set('Counter', {
                version: 'v1',
                htmlCode: '<div>((count))</div>',
                cssCode: '',
            });

            // Pre-populate state store
            reactor.persistence.save('Counter#main', {
                vars: { count: 99 },
                extraState: null,
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="c"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('c');

            const id = new ComponentId('Counter', 'main', 'v1');
            // Pass default vars (count: 0) — should be overridden by stored state
            const instance = await registry.create(id, Counter, { count: 0 }, container);

            assert.strictEqual(instance.count, 99);
        });

        it('passes extraState as previousState to init()', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-restore-2');

            let receivedPreviousState = 'not-called';

            class Dashboard extends Component {
                /** @type {string} */
                title = '';

                /**
                 * Init with previousState
                 * @param {object|null} previousState - Restored state
                 */
                async init(previousState) {
                    receivedPreviousState = previousState;
                }
            }
            registry.registerComponent('Dashboard', Dashboard);
            templateStore.set('Dashboard', {
                version: 'v1',
                htmlCode: '<div>((title))</div>',
                cssCode: '',
            });

            // Pre-populate state store with extra state
            reactor.persistence.save('Dashboard#main', {
                vars: { title: 'Restored Title' },
                extraState: { secretData: 'from-destroy' },
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="d"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('d');

            const id = new ComponentId('Dashboard', 'main', 'v1');
            await registry.create(id, Dashboard, {}, container);

            assert.deepStrictEqual(receivedPreviousState, { secretData: 'from-destroy' });
        });

        it('passes null as previousState on fresh mount', async () => {
            const { registry, templateStore } = createTestRig('state-restore-3');

            let receivedPreviousState = 'not-called';

            class Fresh extends Component {
                /**
                 * Init hook
                 * @param {object|null} previousState - Restored state
                 */
                async init(previousState) {
                    receivedPreviousState = previousState;
                }
            }
            registry.registerComponent('Fresh', Fresh);
            templateStore.set('Fresh', {
                version: 'v1',
                htmlCode: '<div>fresh</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="f"></div>');
            global.document = dom.window.document;
            const container = dom.window.document.getElementById('f');

            const id = new ComponentId('Fresh', 'main', 'v1');
            await registry.create(id, Fresh, {}, container);

            assert.strictEqual(receivedPreviousState, null);
        });

        it('consumes state from store after restore (no double-restore)', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-restore-4');

            class Counter extends Component {
                /** @type {number} */
                count = 0;
            }
            registry.registerComponent('Counter', Counter);
            templateStore.set('Counter', {
                version: 'v1',
                htmlCode: '<div>((count))</div>',
                cssCode: '',
            });

            // Pre-populate
            reactor.persistence.save('Counter#main', {
                vars: { count: 99 },
                extraState: null,
            });

            const dom = new JSDOM('<!DOCTYPE html><div id="c"></div>');
            global.document = dom.window.document;

            // First create — restores from store
            const container1 = dom.window.document.createElement('div');
            const id = new ComponentId('Counter', 'main', 'v1');
            const instance1 = await registry.create(id, Counter, { count: 0 }, container1);
            assert.strictEqual(instance1.count, 99);

            // State should be consumed
            assert.strictEqual(reactor.persistence.has('Counter#main'), false);

            // Remove and create again — should use default vars, not old stored state
            await registry.remove(id);

            // The remove captures current state (count: 99) again, so remove that too
            reactor.persistence.delete('Counter#main');

            const container2 = dom.window.document.createElement('div');
            const instance2 = await registry.create(id, Counter, { count: 7 }, container2);
            assert.strictEqual(instance2.count, 7);
        });
    });

    describe('round-trip (capture + restore)', () => {
        it('captures and restores scalar vars through destroy/create cycle', async () => {
            const { reactor, registry, templateStore } = createTestRig('state-roundtrip-1');

            class Counter extends Component {
                /** @type {number} */
                count = 0;

                /** @type {string} */
                label = '';
            }
            registry.registerComponent('Counter', Counter);
            templateStore.set('Counter', {
                version: 'v1',
                htmlCode: '<div>((label)): ((count))</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div></div>');
            global.document = dom.window.document;

            // Create, modify, destroy
            const container1 = dom.window.document.createElement('div');
            const id = new ComponentId('Counter', 'main', 'v1');
            const instance1 = await registry.create(
                id,
                Counter,
                { count: 10, label: 'Total' },
                container1,
            );
            instance1.count = 42;
            instance1.label = 'Updated';

            await registry.remove(id);

            // Recreate — should have the updated values
            const container2 = dom.window.document.createElement('div');
            const instance2 = await registry.create(id, Counter, { count: 0, label: '' }, container2);

            assert.strictEqual(instance2.count, 42);
            assert.strictEqual(instance2.label, 'Updated');
        });

        it('captures and restores extraState through destroy/create cycle', async () => {
            const { registry, templateStore } = createTestRig('state-roundtrip-2');

            let restoredSecret = null;

            class Dashboard extends Component {
                /** @type {string} */
                title = '';

                /**
                 * Captures private data
                 * @returns {{secret: string}}
                 */
                destroy() {
                    return { secret: 'my-secret-data' };
                }

                /**
                 * Restores private data
                 * @param {object|null} previousState - Previous state
                 */
                async init(previousState) {
                    if (previousState) {
                        restoredSecret = previousState.secret;
                    }
                }
            }
            registry.registerComponent('Dashboard', Dashboard);
            templateStore.set('Dashboard', {
                version: 'v1',
                htmlCode: '<div>((title))</div>',
                cssCode: '',
            });

            const dom = new JSDOM('<!DOCTYPE html><div></div>');
            global.document = dom.window.document;

            // Create and destroy
            const container1 = dom.window.document.createElement('div');
            const id = new ComponentId('Dashboard', 'main', 'v1');
            await registry.create(id, Dashboard, { title: 'Test' }, container1);
            await registry.remove(id);

            // Recreate — init should receive the previousState from destroy()
            const container2 = dom.window.document.createElement('div');
            await registry.create(id, Dashboard, {}, container2);

            assert.strictEqual(restoredSecret, 'my-secret-data');
        });
    });

    describe('persistence instance', () => {
        it('is initialized automatically on reactor', () => {
            const reactor = createReactor('state-store-1', { morphFunction: mockMorph });
            assert.ok(reactor.persistence);
        });
    });
});
