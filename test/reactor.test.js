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
import { REACTOR, LIFECYCLE_ACTIVE } from '../src/symbols.js';
import { ComponentNotFoundError } from '../src/errors/error-hierarchy.js';
import { StrictConsole } from './strict-console.js';

// Mock idiomorph for testing
const mockMorph = () => { };

// Track app names to unregister after each test
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
 * Create a Reactor and track it for cleanup.
 * Injects a StrictConsole by default unless the caller provides its own console
 * (e.g. console multiplexer tests that need custom objects).
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

            class Counter extends Component { }

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
            assert.strictEqual(instance.count, 0);
        });

        it('attaches reactor to component', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component { }

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

            assert.strictEqual(instance[REACTOR], reactor);
        });

        it('delegates to instanceRegistry.createFromReference()', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component { }

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
            // start() wraps in FuseWire/Root — the ref passed to createFromReference is the Root
            assert.strictEqual(receivedRef.componentName, 'FuseWire/Root');
            assert.strictEqual(receivedRef.componentId, 'root');
        });

        it('adds fusewire and appName classes to root container', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component { }

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
            assert.ok(!container.classList.contains('FuseWire_Root'));
            assert.ok(container.firstChild.classList.contains('FuseWire_Root'));
        });

        it('adds app classes only to first container', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div><div id="child"></div>');
            global.document = dom.window.document;

            class Parent extends Component { }

            const appName = 'test-start-5';
            const templateStore = new TemplateStore();
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>Parent</div>', cssCode: '' });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Parent', Parent);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore: templateStore,
                renderer: renderer
            });

            const rootContainer = dom.window.document.getElementById('app');

            await reactor.start(rootContainer, 'Parent', 'main', {});

            // Root container gets fusewire + appName
            assert.ok(rootContainer.classList.contains('fusewire'));
            assert.ok(rootContainer.classList.contains(appName));
        });

        it('sets container on component instance', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component { }

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

            // Component container is nested inside the Root wrapper's container
            assert.ok(instance.componentContainer);
            assert.ok(instance instanceof Counter);
        });
    });

    describe('react()', () => {
        it('accepts ComponentId', async () => {
            let renderCalled = false;
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                    assert.ok(componentId instanceof ComponentId);
                },
                get() { return fakeInstance; },
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
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                    assert.ok(componentId instanceof ComponentId);
                    assert.strictEqual(componentId.name, 'Counter');
                    assert.strictEqual(componentId.id, 'main');
                },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-react-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });

            await reactor.react('Counter#main', 'CSR');

            assert.strictEqual(renderCalled, true);
        });

        it('defaults to CSR mode', async () => {
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render() { },
                get() { return fakeInstance; },
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
                async render() { },
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
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render(componentId) {
                    renderCalled = true;
                },
                get() { return fakeInstance; },
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
                async render() { },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-react-6', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph
            });

            await reactor.react('Counter#main');

            assert.strictEqual(afterRenderCalled, true);
        });

        it('throws if instance is not found after render()', async () => {
            const strict = new StrictConsole();
            strict.expectError(/Error during re-render/);
            activeStrictConsoles.push(strict);

            const mockRegistry = {
                async render() { },
                get() { return null; },
            };

            const reactor = createReactor('test-react-7', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: strict,
            });

            await assert.rejects(
                () => reactor.react('Counter#main'),
                ComponentNotFoundError,
            );
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
                console: { log() { }, warn() { }, error() { } },
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
            reactor.attachConsole({ log() { }, warn() { }, error() { } });

            reactor.console.log('test');
            assert.deepStrictEqual(defaultLogs, [['log', 'test']]);
        });

        it('supports multiple attached consoles', () => {
            const logs1 = [];
            const logs2 = [];

            const reactor = createReactor('test-attach-3', {
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });
            reactor.attachConsole({
                log(...args) { logs1.push(args); },
                warn() { },
                error() { },
            });
            reactor.attachConsole({
                log(...args) { logs2.push(args); },
                warn() { },
                error() { },
            });

            reactor.console.log('broadcast');

            assert.deepStrictEqual(logs1, [['broadcast']]);
            assert.deepStrictEqual(logs2, [['broadcast']]);
        });

        it('uses default console before any attach', () => {
            const defaultLogs = [];
            const defaultConsole = {
                log(...args) { defaultLogs.push(args); },
                warn() { },
                error() { },
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
                warn() { },
                error() { },
            };

            const reactor = createReactor('test-detach-1', {
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
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
                warn() { },
                error() { },
            };
            const attached = { log() { }, warn() { }, error() { } };

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
                console: { log() { }, warn() { }, error() { } },
            });
            // Should not throw
            reactor.detachConsole({ log() { }, warn() { }, error() { } });
        });

        it('only removes the specific console from multiple', () => {
            const logs1 = [];
            const logs2 = [];
            const c1 = {
                log(...args) { logs1.push(args); },
                warn() { },
                error() { },
            };
            const c2 = {
                log(...args) { logs2.push(args); },
                warn() { },
                error() { },
            };

            const reactor = createReactor('test-detach-4', {
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });
            reactor.attachConsole(c1);
            reactor.attachConsole(c2);
            reactor.detachConsole(c1);
            reactor.console.log('only c2');

            assert.deepStrictEqual(logs1, []);
            assert.deepStrictEqual(logs2, [['only c2']]);
        });
    });

    describe('render queue', () => {
        it('deduplicates queued react() calls for the same component', async () => {
            let renderCount = 0;
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render() { renderCount++; },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-queue-1', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
            });

            // Fire two reacts for the same component in the same synchronous block.
            // Because _drain() is scheduled as a microtask, the queue is not drained
            // until the synchronous block finishes. The second call sees the component
            // already in the queue and drops the redundant request.
            // Result: 1 render total.
            const p1 = reactor.react('Counter#main');
            const p2 = reactor.react('Counter#main');

            // Both return the same drain promise
            assert.strictEqual(p1, p2);
            await p1;
            assert.strictEqual(renderCount, 1);
        });

        it('processes different components sequentially', async () => {
            const order = [];
            const fakeA = { afterRender() { order.push('afterA'); } };
            const fakeB = { afterRender() { order.push('afterB'); } };
            const mockRegistry = {
                async render(id) { order.push(`render:${id.code}`); },
                get(id) { return id.code === 'A#1' ? fakeA : fakeB; },
            };

            const reactor = createReactor('test-queue-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
            });

            reactor.react('A#1');
            reactor.react('B#1');
            await reactor._drainPromise;

            assert.deepStrictEqual(order, [
                'render:A#1', 'afterA',
                'render:B#1', 'afterB',
            ]);
        });

        it('processes entries enqueued during afterRender', async () => {
            const order = [];
            let reactor;
            const fakeA = {
                afterRender() {
                    order.push('afterA');
                    // This simulates Counter.afterRender → console.log → Panel.react()
                    reactor.react('B#1');
                },
            };
            const fakeB = { afterRender() { order.push('afterB'); } };
            const mockRegistry = {
                async render(id) { order.push(`render:${id.code}`); },
                get(id) { return id.code === 'A#1' ? fakeA : fakeB; },
            };

            reactor = createReactor('test-queue-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
            });

            await reactor.react('A#1');

            // B was enqueued during A's afterRender and processed in the same drain
            assert.deepStrictEqual(order, [
                'render:A#1', 'afterA',
                'render:B#1', 'afterB',
            ]);
        });

        it('is not draining after queue is empty', async () => {
            const fakeInstance = { afterRender() { } };
            const mockRegistry = {
                async render() { },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-queue-4', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
            });

            await reactor.react('Counter#main');

            assert.strictEqual(reactor._draining, false);
            assert.strictEqual(reactor._queue.size, 0);
        });

        it('sets LIFECYCLE_ACTIVE during afterRender in drain', async () => {
            let capturedFlag = 'not-captured';
            const fakeInstance = {
                [LIFECYCLE_ACTIVE]: null,
                afterRender() {
                    capturedFlag = this[LIFECYCLE_ACTIVE];
                },
            };
            const mockRegistry = {
                async render() { },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-queue-5', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
            });

            await reactor.react('Counter#main');

            assert.strictEqual(capturedFlag, 'afterRender');
            assert.strictEqual(fakeInstance[LIFECYCLE_ACTIVE], null, 'flag cleared after afterRender');
        });

        it('clears LIFECYCLE_ACTIVE even when afterRender throws in drain', async () => {
            const strict = new StrictConsole();
            strict.expectError(/Error during re-render/);
            activeStrictConsoles.push(strict);

            const fakeInstance = {
                [LIFECYCLE_ACTIVE]: null,
                afterRender() {
                    throw new Error('afterRender failed');
                },
            };
            const mockRegistry = {
                async render() { },
                get() { return fakeInstance; },
            };

            const reactor = createReactor('test-queue-6', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: strict,
            });

            await assert.rejects(
                () => reactor.react('Counter#main'),
                /afterRender failed/,
            );

            assert.strictEqual(fakeInstance[LIFECYCLE_ACTIVE], null, 'flag cleared despite throw');
        });
    });

    describe('globalVars config', () => {
        it('_globalVars defaults to empty object when not provided', () => {
            const reactor = createReactor('test-global-1', { morphFunction: mockMorph });
            assert.deepStrictEqual(reactor._globalVars, {});
        });

        it('stores globalVars passed at construction time', () => {
            const reactor = createReactor('test-global-2', {
                morphFunction: mockMorph,
                globalVars: { bs: { card: 'card', h100: 'h-100' } },
            });
            assert.deepStrictEqual(reactor._globalVars, { bs: { card: 'card', h100: 'h-100' } });
        });

        it('stores multiple named globals independently', () => {
            const reactor = createReactor('test-global-3', {
                morphFunction: mockMorph,
                globalVars: { bs: { card: 'card' }, icons: { chevron: 'bi-chevron-right' } },
            });
            assert.deepStrictEqual(reactor._globalVars.bs, { card: 'card' });
            assert.deepStrictEqual(reactor._globalVars.icons, { chevron: 'bi-chevron-right' });
        });

        it('global vars are merged into render context at lower priority than component vars', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Counter extends Component { }

            const appName = 'test-global-4';
            const templateStore = new TemplateStore();
            // Template uses a global var ((bs.card)) and a component var ((count))
            templateStore.set('Counter', {
                version: 'test',
                htmlCode: '<div class="((bs.card))">((count))</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Counter', Counter);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore,
                renderer,
                globalVars: { bs: { card: 'card-component' } },
            });

            const container = dom.window.document.getElementById('app');
            const instance = await reactor.start(container, 'Counter', 'main', { count: 5 });

            // Global var resolved: ((bs.card)) → 'card-component'
            // Component var resolved: ((count)) → 5
            assert.ok(container.innerHTML.includes('card-component'));
            assert.ok(container.innerHTML.includes('5'));
            assert.ok(instance instanceof Counter);
        });

        it('component vars override global vars on name collision', async () => {
            const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
            global.document = dom.window.document;

            class Widget extends Component { }

            const appName = 'test-global-5';
            const templateStore = new TemplateStore();
            templateStore.set('Widget', {
                version: 'test',
                htmlCode: '<div>((shared))</div>',
                cssCode: '',
            });

            const renderer = new Renderer(mockMorph, appName);
            const registry = new InstanceRegistry(renderer, templateStore, appName);
            registry.registerComponent('Widget', Widget);
            const reactor = createReactor(appName, {
                instanceRegistry: registry,
                templateStore,
                renderer,
                globalVars: { shared: 'global-value' },
            });

            const container = dom.window.document.getElementById('app');
            // Component var 'shared' should override the global
            await reactor.start(container, 'Widget', 'main', { shared: 'component-value' });

            assert.ok(container.innerHTML.includes('component-value'));
            assert.ok(!container.innerHTML.includes('global-value'));
        });
    });

    describe('on()', () => {
        it('registers a handler that broadcast() calls', () => {
            const calls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots() { },
            };
            const reactor = createReactor('test-on-1', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.on('theme', (value) => calls.push(value));
            reactor.broadcast('theme', 'dark');

            assert.deepStrictEqual(calls, ['dark']);
        });

        it('returns an unsubscribe function', () => {
            const calls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots() { },
            };
            const reactor = createReactor('test-on-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            const unsub = reactor.on('theme', (value) => calls.push(value));
            reactor.broadcast('theme', 'dark');
            unsub();
            reactor.broadcast('theme', 'light');

            assert.deepStrictEqual(calls, ['dark']);
        });

        it('supports multiple handlers for the same event', () => {
            const log = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots() { },
            };
            const reactor = createReactor('test-on-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.on('theme', () => log.push('a'));
            reactor.on('theme', () => log.push('b'));
            reactor.broadcast('theme', 'dark');

            assert.deepStrictEqual(log, ['a', 'b']);
        });
    });

    describe('broadcast()', () => {
        it('calls reactor-level listeners before component propagation', () => {
            const order = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots() { order.push('components'); },
            };
            const reactor = createReactor('test-bcast-1', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.on('theme', () => order.push('reactor'));
            reactor.broadcast('theme', 'dark');

            assert.deepStrictEqual(order, ['reactor', 'components']);
        });

        it('forwards arguments to reactor listeners and component tree', () => {
            const reactorArgs = [];
            const registryArgs = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots(eventName, args) {
                    registryArgs.push({ eventName, args });
                },
            };
            const reactor = createReactor('test-bcast-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.on('config', (...args) => reactorArgs.push(args));
            reactor.broadcast('config', 'key', 42);

            assert.deepStrictEqual(reactorArgs, [['key', 42]]);
            assert.deepStrictEqual(registryArgs, [{ eventName: 'config', args: ['key', 42] }]);
        });

        it('works with no registered listeners', () => {
            const registryCalls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots(eventName, args) {
                    registryCalls.push(eventName);
                },
            };
            const reactor = createReactor('test-bcast-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            // Should not throw and should still propagate to components
            reactor.broadcast('theme', 'dark');
            assert.deepStrictEqual(registryCalls, ['theme']);
        });

        it('logs errors from reactor listeners and continues propagation', () => {
            const errors = [];
            const registryCalls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFromRoots(eventName, args) {
                    registryCalls.push(eventName);
                },
            };
            const reactor = createReactor('test-bcast-4', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: {
                    log() { },
                    warn() { },
                    error(...args) { errors.push(args); },
                },
            });

            reactor.on('theme', () => { throw new Error('boom'); });
            reactor.broadcast('theme', 'dark');

            assert.strictEqual(errors.length, 1);
            assert.ok(errors[0][0].includes('boom'));
            assert.deepStrictEqual(registryCalls, ['theme'], 'propagation continued after error');
        });
    });

    describe('broadcastFrom()', () => {
        it('delegates to instanceRegistry.broadcastFrom()', () => {
            const registryCalls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFrom(componentId, eventName, args) {
                    registryCalls.push({ code: componentId.code, eventName, args });
                },
            };
            const reactor = createReactor('test-bfrom-1', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            const cid = new ComponentId('Panel', 'main');
            reactor.broadcastFrom(cid, 'theme', 'dark');

            assert.strictEqual(registryCalls.length, 1);
            assert.strictEqual(registryCalls[0].code, 'Panel#main');
            assert.strictEqual(registryCalls[0].eventName, 'theme');
            assert.deepStrictEqual(registryCalls[0].args, ['dark']);
        });

        it('forwards multiple arguments', () => {
            const registryCalls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFrom(componentId, eventName, args) {
                    registryCalls.push({ eventName, args });
                },
            };
            const reactor = createReactor('test-bfrom-2', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.broadcastFrom(new ComponentId('Panel', 'main'), 'config', 'key', 42);

            assert.deepStrictEqual(registryCalls[0].args, ['key', 42]);
        });

        it('does not fire reactor-level listeners', () => {
            const reactorCalls = [];
            const mockRegistry = {
                _reactor: null,
                broadcastFrom() { },
            };
            const reactor = createReactor('test-bfrom-3', {
                instanceRegistry: mockRegistry,
                morphFunction: mockMorph,
                console: { log() { }, warn() { }, error() { } },
            });

            reactor.on('theme', () => reactorCalls.push('fired'));
            reactor.broadcastFrom(new ComponentId('Panel', 'main'), 'theme', 'dark');

            assert.deepStrictEqual(reactorCalls, [], 'reactor listeners should not fire for scoped broadcast');
        });
    });
});
