import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { Reactor } from '../src/reactor.js';
import { Component } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { InstanceRegistry } from '../src/instance.js';
import { Renderer } from '../src/renderer.js';
import { TemplateStore } from '../src/template-store.js';
import { FuseWire } from '../src/fusewire.js';
import { JSDOM } from 'jsdom';

// Mock idiomorph for testing
const mockMorph = () => {};

// Track app names to unregister after each test
let registeredApps = [];

afterEach(() => {
    for (const name of registeredApps) {
        FuseWire.unregister(name);
    }
    registeredApps = [];
});

/**
 * Create a Reactor and track it for cleanup
 * @param {string} appName - Application name
 * @param {object} config - Reactor config
 * @returns {Reactor} The created reactor
 */
function createReactor(appName, config = {}) {
    registeredApps.push(appName);
    return new Reactor(appName, config);
}

describe('Reactor', () => {
    describe('Constructor', () => {
        it('creates reactor instance with morphFunction', () => {
            const reactor = createReactor('test-ctor-1', { morphFunction: mockMorph });
            assert.ok(reactor);
            assert.ok(reactor._instanceRegistry);
            assert.ok(reactor._templateStore);
            assert.ok(reactor._renderer);
        });

        it('creates reactor instance with morphFunction override', () => {
            const reactor = createReactor('test-ctor-2', { morphFunction: mockMorph });
            assert.ok(reactor);
            assert.ok(reactor._instanceRegistry);
            assert.ok(reactor._templateStore);
            assert.ok(reactor._renderer);
        });

        it('creates reactor instance with provided dependencies', () => {
            const appName = 'test-ctor-3';
            const templateStore = new TemplateStore();
            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });
            
            assert.ok(reactor);
            assert.strictEqual(reactor._instanceRegistry, registry);
            assert.strictEqual(reactor._templateStore, templateStore);
            assert.strictEqual(reactor._renderer, renderer);
        });

        it('accepts optional config', () => {
            const config = { 
                morphFunction: mockMorph,
                logging: { enabled: false } 
            };
            const reactor = createReactor('test-ctor-4', config);
            assert.deepStrictEqual(reactor._config, config);
        });

        it('passes appName to auto-created renderer', () => {
            const reactor = createReactor('test-ctor-5', { morphFunction: mockMorph });
            assert.strictEqual(reactor._renderer._appName, 'test-ctor-5');
        });
    });

    describe('Validation', () => {
        it('throws for invalid CSS class name (starts with number)', () => {
            assert.throws(
                () => createReactor('123invalid', { morphFunction: mockMorph }),
                /not a valid CSS class name/,
            );
        });

        it('throws for invalid CSS class name (contains spaces)', () => {
            assert.throws(
                () => createReactor('has space', { morphFunction: mockMorph }),
                /not a valid CSS class name/,
            );
        });

        it('throws for invalid CSS class name (contains dots)', () => {
            assert.throws(
                () => createReactor('has.dot', { morphFunction: mockMorph }),
                /not a valid CSS class name/,
            );
        });

        it('accepts valid CSS class names', () => {
            const reactor1 = createReactor('valid-name', { morphFunction: mockMorph });
            assert.ok(reactor1);
            const reactor2 = createReactor('_underscore', { morphFunction: mockMorph });
            assert.ok(reactor2);
            const reactor3 = createReactor('camelCase', { morphFunction: mockMorph });
            assert.ok(reactor3);
            const reactor4 = createReactor('with-123', { morphFunction: mockMorph });
            assert.ok(reactor4);
        });

        it('throws for duplicate app name', () => {
            createReactor('unique-app', { morphFunction: mockMorph });
            assert.throws(
                () => createReactor('unique-app', { morphFunction: mockMorph }),
                /already registered/,
            );
        });
    });

    describe('start()', () => {
        it('creates and starts a root component', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component {}

            const appName = 'test-start-1';
            const templateStore = new TemplateStore();
            templateStore.set('Counter', {
                version: 'test',
                htmlCode: '<div>Count: ((count))</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Counter', Counter);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });
            const container = dom.window.document.getElementById('app');
            
            const instance = await reactor.start(container, 'Counter', 'main', { count: 0 });

            assert.ok(instance);
            assert.ok(instance instanceof Counter);
            assert.strictEqual(instance.componentName, 'Counter');
            assert.strictEqual(instance.componentId, 'main');
            assert.deepStrictEqual(instance.vars, { count: 0 });
        });

        it('attaches reactor to component', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component {}

            const appName = 'test-start-2';
            const templateStore = new TemplateStore();
            templateStore.set('Counter', {
                version: 'test',
                htmlCode: '<div>Count: ((count))</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Counter', Counter);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });
            const container = dom.window.document.getElementById('app');
            
            const instance = await reactor.start(container, 'Counter', 'main', {});

            assert.strictEqual(instance._reactor, reactor);
        });

        it('delegates to instanceRegistry.createFromReference()', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component {}

            let createCalled = false;
            let receivedRef = null;
            const mockRegistry = {
                _reactor: null,
                async createFromReference(ref, container) {
                    createCalled = true;
                    receivedRef = ref;
                    const instance = new Counter('', {});
                    return instance;
                },
            };

            const reactor = createReactor('test-start-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });
            const container = dom.window.document.getElementById('app');
            
            await reactor.start(container, 'Counter', 'main', {});

            assert.strictEqual(createCalled, true);
            assert.strictEqual(receivedRef.componentName, 'Counter');
            assert.strictEqual(receivedRef.id, 'main');
        });

        it('adds fusewire and appName classes to root container', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component {}

            const appName = 'test-start-4';
            const templateStore = new TemplateStore();
            templateStore.set('Counter', {
                version: 'test',
                htmlCode: '<div>Test</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Counter', Counter);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });
            const container = dom.window.document.getElementById('app');

            await reactor.start(container, 'Counter', 'main', {});

            assert.ok(container.classList.contains('fusewire'));
            assert.ok(container.classList.contains(appName));
            // Root component class is on a child element (CSS scoping needs nesting)
            assert.ok(!container.classList.contains('fusewire-component-Counter'));
            assert.ok(container.firstChild.classList.contains('fusewire-component-Counter'));
        });

        it('adds app classes only to first container', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div><div id="child"></div>');
            global.document = dom.window.document;

            class Parent extends Component {}
            class Child extends Component {}

            const appName = 'test-start-5';
            const templateStore = new TemplateStore();
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>Parent</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div>Child</div>', cssCode: '' });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Parent', Parent);
            registry.registerComponent('Child', Child);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });

            const rootContainer = dom.window.document.getElementById('app');
            const childContainer = dom.window.document.getElementById('child');

            await reactor.start(rootContainer, 'Parent', 'main', {});
            await reactor.start(childContainer, 'Child', 'child', {});

            // Root container gets fusewire + appName
            assert.ok(rootContainer.classList.contains('fusewire'));
            assert.ok(rootContainer.classList.contains(appName));

            // Child container gets component class but NOT fusewire/appName
            assert.ok(childContainer.classList.contains('fusewire-component-Child'));
            assert.ok(!childContainer.classList.contains('fusewire'));
        });

        it('sets container on component instance', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component {}

            const appName = 'test-start-6';
            const templateStore = new TemplateStore();
            templateStore.set('Counter', {
                version: 'test',
                htmlCode: '<div>Test</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Counter', Counter);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });
            const container = dom.window.document.getElementById('app');

            const instance = await reactor.start(container, 'Counter', 'main', {});

            // Root component container is the child element created for CSS scoping
            assert.strictEqual(instance.componentContainer, container.firstChild);
            assert.strictEqual(instance.componentContainer.parentElement, container);
        });
    });

    describe('react()', () => {
        it('accepts ComponentId', async () => {
            let renderCalled = false;
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                    assert.ok(componentId instanceof ComponentId);
                },
                get() { return null; },
            };

            const reactor = createReactor('test-react-1', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });
            const componentId = new ComponentId('Counter', 'main');
            
            await reactor.react(componentId, 'CSR');

            assert.strictEqual(renderCalled, true);
        });

        it('accepts string componentId', async () => {
            let renderCalled = false;
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                    assert.ok(componentId instanceof ComponentId);
                    assert.strictEqual(componentId.name, 'Counter');
                    assert.strictEqual(componentId.id, 'main');
                },
                get() { return null; },
            };

            const reactor = createReactor('test-react-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });
            
            await reactor.react('Counter#main', 'CSR');

            assert.strictEqual(renderCalled, true);
        });

        it('defaults to CSR mode', async () => {
            const mockRegistry = {
                async render() {},
                get() { return null; },
            };

            const reactor = createReactor('test-react-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });
            
            // Should not throw
            await reactor.react('Counter#main');
        });

        it('throws for unsupported render mode', async () => {
            const mockRegistry = {
                async render() {},
                get() { return null; },
            };

            const reactor = createReactor('test-react-4', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });

            await assert.rejects(
                async () => await reactor.react('Counter#main', 'SSR'),
                /Unsupported render mode "SSR"/,
            );
        });

        it('delegates to instanceRegistry.render()', async () => {
            let renderCalled = false;
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                },
                get() { return null; },
            };

            const reactor = createReactor('test-react-5', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });
            
            await reactor.react('Counter#main');

            assert.strictEqual(renderCalled, true);
        });

        it('calls afterRender() on the instance after render()', async () => {
            let afterRenderCalled = false;
            const fakeInstance = {
                afterRender() { afterRenderCalled = true; },
            };
            const mockRegistry = {
                async render() {},
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-react-6', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });

            await reactor.react('Counter#main');

            assert.strictEqual(afterRenderCalled, true);
        });

        it('does not throw if instance is not found after render()', async () => {
            const mockRegistry = {
                async render() {},
                get() { return null; },
            };

            const reactor = createReactor('test-react-7', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });

            // Should not throw
            await reactor.react('Counter#main');
        });
    });

    describe('registerComponent() removal', () => {
        it('does not have registerComponent method', () => {
            const reactor = createReactor('test-no-register-1', { morphFunction: mockMorph });
            assert.strictEqual(reactor.registerComponent, undefined);
        });
    });

    describe('basePath', () => {
        it('defaults to ./components', () => {
            const reactor = createReactor('test-basepath-1', { morphFunction: mockMorph });
            assert.strictEqual(reactor.basePath, './components');
        });

        it('accepts custom basePath', () => {
            const reactor = createReactor('test-basepath-2', {
                morphFunction: mockMorph,
                basePath: '/custom/path'
            });
            assert.strictEqual(reactor.basePath, '/custom/path');
        });
    });

    describe('attachConsole()', () => {
        it('forwards log calls to attached console', () => {
            const logs = [];
            const attached = {
                log(...args) { logs.push(['log', ...args]); },
                warn(...args) { logs.push(['warn', ...args]); },
                error(...args) { logs.push(['error', ...args]); },
            };

            const reactor = createReactor('test-attach-1', {
                morphFunction: mockMorph,
                console: { log() {}, warn() {}, error() {} },
            });
            reactor.attachConsole(attached);

            reactor.console.log('hello', 42);
            reactor.console.warn('caution');
            reactor.console.error('fail');

            assert.deepStrictEqual(logs, [
                ['log', 'hello', 42],
                ['warn', 'caution'],
                ['error', 'fail'],
            ]);
        });

        it('still calls the default console after attach', () => {
            const defaultLogs = [];
            const defaultConsole = {
                log(...args) { defaultLogs.push(['log', ...args]); },
                warn(...args) { defaultLogs.push(['warn', ...args]); },
                error(...args) { defaultLogs.push(['error', ...args]); },
            };

            const reactor = createReactor('test-attach-2', {
                morphFunction: mockMorph,
                console: defaultConsole,
            });
            reactor.attachConsole({ log() {}, warn() {}, error() {} });

            reactor.console.log('test');
            assert.deepStrictEqual(defaultLogs, [['log', 'test']]);
        });

        it('supports multiple attached consoles', () => {
            const logs1 = [];
            const logs2 = [];

            const reactor = createReactor('test-attach-3', {
                morphFunction: mockMorph,
                console: { log() {}, warn() {}, error() {} },
            });
            reactor.attachConsole({
                log(...args) { logs1.push(args); },
                warn() {},
                error() {},
            });
            reactor.attachConsole({
                log(...args) { logs2.push(args); },
                warn() {},
                error() {},
            });

            reactor.console.log('broadcast');

            assert.deepStrictEqual(logs1, [['broadcast']]);
            assert.deepStrictEqual(logs2, [['broadcast']]);
        });

        it('uses default console before any attach', () => {
            const defaultLogs = [];
            const defaultConsole = {
                log(...args) { defaultLogs.push(args); },
                warn() {},
                error() {},
            };

            const reactor = createReactor('test-attach-4', {
                morphFunction: mockMorph,
                console: defaultConsole,
            });

            reactor.console.log('before attach');
            assert.deepStrictEqual(defaultLogs, [['before attach']]);
        });
    });

    describe('detachConsole()', () => {
        it('stops forwarding to detached console', () => {
            const logs = [];
            const attached = {
                log(...args) { logs.push(args); },
                warn() {},
                error() {},
            };

            const reactor = createReactor('test-detach-1', {
                morphFunction: mockMorph,
                console: { log() {}, warn() {}, error() {} },
            });
            reactor.attachConsole(attached);
            reactor.console.log('before');
            reactor.detachConsole(attached);
            reactor.console.log('after');

            assert.deepStrictEqual(logs, [['before']]);
        });

        it('still calls default console after detach', () => {
            const defaultLogs = [];
            const defaultConsole = {
                log(...args) { defaultLogs.push(args); },
                warn() {},
                error() {},
            };
            const attached = { log() {}, warn() {}, error() {} };

            const reactor = createReactor('test-detach-2', {
                morphFunction: mockMorph,
                console: defaultConsole,
            });
            reactor.attachConsole(attached);
            reactor.detachConsole(attached);
            reactor.console.log('still works');

            assert.deepStrictEqual(defaultLogs, [['still works']]);
        });

        it('is a no-op for unknown console', () => {
            const reactor = createReactor('test-detach-3', {
                morphFunction: mockMorph,
                console: { log() {}, warn() {}, error() {} },
            });
            // Should not throw
            reactor.detachConsole({ log() {}, warn() {}, error() {} });
        });

        it('only removes the specific console from multiple', () => {
            const logs1 = [];
            const logs2 = [];
            const c1 = {
                log(...args) { logs1.push(args); },
                warn() {},
                error() {},
            };
            const c2 = {
                log(...args) { logs2.push(args); },
                warn() {},
                error() {},
            };

            const reactor = createReactor('test-detach-4', {
                morphFunction: mockMorph,
                console: { log() {}, warn() {}, error() {} },
            });
            reactor.attachConsole(c1);
            reactor.attachConsole(c2);
            reactor.detachConsole(c1);
            reactor.console.log('only c2');

            assert.deepStrictEqual(logs1, []);
            assert.deepStrictEqual(logs2, [['only c2']]);
        });
    });
});
