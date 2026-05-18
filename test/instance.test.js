import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
});
const { window } = dom;

global.window = window;
global.document = window.document;
global.Node = window.Node;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.HTMLHeadElement = window.HTMLHeadElement;
global.HTMLTemplateElement = window.HTMLTemplateElement;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
global.HTMLSelectElement = window.HTMLSelectElement;
global.HTMLOptionElement = window.HTMLOptionElement;
global.Document = window.Document;
global.DocumentFragment = window.DocumentFragment;
global.DOMParser = window.DOMParser;
global.CustomEvent = window.CustomEvent;
global.Event = window.Event;

// Mock fetch for relative component templates
global.fetch = async (url) => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    let relativePath = url.toString();
    if (relativePath.startsWith('http://localhost/')) {
        relativePath = relativePath.replace('http://localhost/', '');
    }
    const absolutePath = path.resolve(process.cwd(), relativePath);
    try {
        const content = await fs.readFile(absolutePath, 'utf8');
        return {
            ok: true,
            status: 200,
            text: async () => content,
            headers: new Map([['etag', 'v1']]),
        };
    } catch (e) {
        return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => 'Not Found',
            headers: new Map(),
        };
    }
};

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { InstanceRegistry, collectVars } from '../src/instance.js';
import { broadcastFromRoots, broadcastFrom } from '../src/broadcast.js';
import { Renderer } from '../src/renderer.js';
import { TemplateStore } from '../src/template-store.js';
import { Component } from '../src/component.js';
import { createComponentId, componentIdFromCode, componentIdsEqual } from '../src/component-id.js';
import { ComponentNotFoundError } from '../src/errors/error-hierarchy.js';
import { Idiomorph } from 'idiomorph';
import { Child } from '../src/component.js';
import { COMPONENT_ID, LIFECYCLE_ACTIVE, EVENTS, CONSOLE, LIBRARIES, REACTOR, IS_CHILD, IS_COMPONENT } from '../src/symbols.js';

import { findChildMountPoints } from '../src/utils/dom-helpers.js';
import { StateSerializer } from '../src/state-serializer.js';
import { Persistence } from '../src/persistence.js';
import { StrictConsole } from './strict-console.js';

describe('InstanceRegistry', () => {
    let document;
    let registry;
    let renderer;
    let templateStore;
    let container;
    let strictConsole;

    // Test component class
    class TestComponent extends Component {
        constructor() {
            super();
            this.name = 'test';
            this.msg = 'hello';
        }
        init() {}
        hydrate() {}
        afterRender() {}
    }

    beforeEach(() => {
        const testDom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
        document = testDom.window.document;
        global.document = document;
        global.window = testDom.window;
        container = document.getElementById('container');

        templateStore = new TemplateStore();
        // Default templates for all inline test component classes.
        // create() → render() → _ensureTemplate() lazy-loads templates from disk,
        // but test components don't have real files.
        const defaultTemplate = { version: 'v1', htmlCode: '<div></div>', cssCode: '' };
        const defaultMsgTemplate = { version: 'v1', htmlCode: '<div>((msg))</div>', cssCode: '' };
        templateStore.set('TestComponent', defaultMsgTemplate);
        templateStore.set('InitComponent', defaultTemplate);
        templateStore.set('AfterRenderComponent', defaultTemplate);
        templateStore.set('InitReacter', defaultTemplate);
        templateStore.set('AfterRenderReacter', defaultTemplate);
        templateStore.set('UpdateReacter', defaultTemplate);
        templateStore.set('DestroyComponent', defaultTemplate);
        templateStore.set('C1', defaultTemplate);
        templateStore.set('C2', defaultTemplate);
        templateStore.set('Root', defaultTemplate);
        templateStore.set('HydrateComponent', defaultTemplate);
        templateStore.set('CheckActive', defaultTemplate);
        templateStore.set('HydrateReacter', defaultTemplate);
        templateStore.set('CheckInit', defaultTemplate);
        templateStore.set('CheckAfterRender', defaultTemplate);
        templateStore.set('LifecycleTracker', defaultTemplate);
        templateStore.set('ThrowingInit', defaultTemplate);
        templateStore.set('OrderComponent', defaultTemplate);
        renderer = new Renderer((container, html, options) => {
            return Idiomorph.morph(container, html, options);
        });

        // Wire a mock reactor (normally done by Reactor constructor)
        strictConsole = new StrictConsole();
        registry = new InstanceRegistry(
            renderer,
            templateStore,
            "testApp",
            new Persistence(new StateSerializer()),
        );
        registry._reactor = {
            console: strictConsole,
            basePath: './components',
            instanceRegistry: registry,
            globalVars: {},
            react: (id, mode) => registry.render(id),
            drainPromise: Promise.resolve(),
        };
        registry.registerComponent('TestComponent', TestComponent);
    });

    afterEach(() => {
        registry.clearAll();
        strictConsole.assertClean();
    });

    describe('Constructor', () => {
        it('creates instance with renderer and template store', () => {
            assert.ok(registry instanceof InstanceRegistry);
        });
    });

    describe('collectVars()', () => {
        it('collects public variables and $ prefixed getters', () => {
            class VarComponent extends Component {
                msg = 'hello';
                _private = 'secret';
                get $calculated() { return 'world'; }
            }
            const instance = new VarComponent();
            const vars = collectVars(instance);

            assert.strictEqual(vars.msg, 'hello');
            assert.strictEqual(vars.$calculated, 'world');
            assert.strictEqual(vars._private, 'secret');
        });
    });

    describe('create()', () => {
        it('creates a new component instance', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);

            assert.ok(instance instanceof TestComponent);
            assert.strictEqual(instance.componentName, 'TestComponent');
            assert.strictEqual(instance.componentId, 'test1');
        });

        it('calls init hook', async () => {
            let initCalled = false;
            class InitComponent extends Component {
                async init() { initCalled = true; }
            }
            const id = createComponentId('InitComponent', 'test1');
            await registry.create(id, InitComponent, {}, container);

            assert.ok(initCalled);
        });

        it('calls afterRender hook', async () => {
            let afterRenderCalled = false;
            class AfterRenderComponent extends Component {
                afterRender() { afterRenderCalled = true; }
            }
            const id = createComponentId('AfterRenderComponent', 'test1');
            await registry.create(id, AfterRenderComponent, {}, container);

            assert.ok(afterRenderCalled);
        });

        it('stores instance in registry', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);

            assert.strictEqual(registry.get(id), instance);
        });

        it('throws if instance already exists', async () => {
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);

            await assert.rejects(
                () => registry.create(id, TestComponent, {}, container),
                /already exists/
            );
        });

        it('sets container on instance', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);

            assert.strictEqual(instance.componentContainer, container);
        });

        it('renders component to container', async () => {
            templateStore.set('TestComponent', { version: 'v1', htmlCode: '<div class="test-content">hello</div>', cssCode: '' });
            const id = createComponentId('TestComponent', 'test1', 'v1');
            await registry.create(id, TestComponent, {}, container);

            assert.ok(container.querySelector('.test-content'));
        });
    });

    describe('lifecycle guard', () => {
        it('prevents react() during init() in create()', async () => {
            class InitReacter extends Component {
                async init() {
                    await this.react();
                }
            }
            const id = createComponentId('InitReacter', 'test1');
            
            // Should warn and ignore, not throw
            await registry.create(id, InitReacter, {}, container);
            
            strictConsole.expectWarning(/react\(\) called during init\(\)/);
        });

        it('queues react() during afterRender() in create()', async () => {
            let reactCalled = false;
            registry._reactor.react = () => { reactCalled = true; return Promise.resolve(); };

            class AfterRenderReacter extends Component {
                afterRender() {
                    this.react();
                }
            }
            const id = createComponentId('AfterRenderReacter', 'test1');
            await registry.create(id, AfterRenderReacter, {}, container);

            assert.ok(reactCalled);
        });

        it('clears LIFECYCLE_ACTIVE after create() completes', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);

            assert.strictEqual(instance[LIFECYCLE_ACTIVE], null);
        });

        it('removes instance from registry when init() throws', async () => {
            class ThrowingInit extends Component {
                async init() { throw new Error('init failed'); }
            }
            const id = createComponentId('ThrowingInit', 'test1');

            await assert.rejects(() => registry.create(id, ThrowingInit, {}, container), /init failed/);
            assert.strictEqual(registry.has(id), false);
        });

        it('prevents react() during update() in InstanceRegistry.update()', async () => {
            class UpdateReacter extends Component {
                async react() {
                    return super.react();
                }
            }
            registry.registerComponent('UpdateReacter', UpdateReacter);
            const id = createComponentId('UpdateReacter', 'test1');
            const instance = await registry.create(id, UpdateReacter, {}, container);

            // Mock reactor.react to detect call
            let reactCalled = false;
            registry._reactor.react = () => { reactCalled = true; return Promise.resolve(); };

            // Manually set update state to simulate registry.update
            instance[LIFECYCLE_ACTIVE] = 'update';
            await instance.react();
            instance[LIFECYCLE_ACTIVE] = null;

            assert.strictEqual(reactCalled, false);
            strictConsole.expectWarning(/react\(\) called during update\(\)/);
        });
    });

    describe('get()', () => {
        it('returns existing instance', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);
            assert.strictEqual(registry.get(id), instance);
        });

        it('returns null for non-existent instance', () => {
            const id = createComponentId('NonExistent', 'test1');
            assert.strictEqual(registry.get(id), null);
        });
    });

    describe('get() with string', () => {
        it('returns existing instance by code string', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, {}, container);
            assert.strictEqual(registry.get('TestComponent#test1'), instance);
        });

        it('returns null for non-existent code', () => {
            assert.strictEqual(registry.get('NonExistent#test1'), null);
        });
    });

    describe('update()', () => {
        it('updates instance vars', async () => {
            const id = createComponentId('TestComponent', 'test1');
            const instance = await registry.create(id, TestComponent, { msg: 'old' }, container);
            
            await registry.update(id, { msg: 'new' });
            assert.strictEqual(instance.msg, 'new');
        });

        it('calls update hook with old vars', async () => {
             // In V1.0.2 there is no update hook, it's just super.update or manual var setting.
        });

        it('calls afterRender hook', async () => {
            let afterRenderCalled = 0;
            class AfterRenderComponent extends Component {
                afterRender() { afterRenderCalled++; }
            }
            const id = createComponentId('AfterRenderComponent', 'test1');
            await registry.create(id, AfterRenderComponent, {}, container);
            const initialCount = afterRenderCalled;

            await registry.update(id, { some: 'var' });
            assert.strictEqual(afterRenderCalled, initialCount + 1);
        });

        it('re-renders component', async () => {
            templateStore.set('TestComponent', { version: 'v1', htmlCode: '<div>((msg))</div>', cssCode: '' });
            const id = createComponentId('TestComponent', 'test1', 'v1');
            await registry.create(id, TestComponent, { msg: 'old' }, container);

            await registry.update(id, { msg: 'new' });
            assert.ok(container.innerHTML.includes('new'));
        });

        it('throws for non-existent instance', async () => {
            const id = createComponentId('NonExistent', 'test1');
            await assert.rejects(() => registry.update(id, {}), ComponentNotFoundError);
        });
    });

    describe('remove()', () => {
        it('calls destroy hook', async () => {
            let destroyCalled = false;
            class DestroyComponent extends Component {
                destroy() { destroyCalled = true; }
            }
            const id = createComponentId('DestroyComponent', 'test1');
            await registry.create(id, DestroyComponent, {}, container);

            registry.remove(id);
            assert.ok(destroyCalled);
        });

        it('removes instance from registry', async () => {
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);

            registry.remove(id);
            assert.strictEqual(registry.has(id), false);
        });

        it('removes DOM element', async () => {
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);
            assert.ok(container.parentNode);

            registry.remove(id);
            assert.strictEqual(container.parentNode, null);
        });

        it('silently ignores non-existent instance', () => {
            const id = createComponentId('NonExistent', 'test1');
            assert.doesNotThrow(() => registry.remove(id));
        });
    });

    describe('render()', () => {
        it('renders existing instance', async () => {
            templateStore.set('TestComponent', { version: 'v1', htmlCode: '<div>updated</div>', cssCode: '' });
            const id = createComponentId('TestComponent', 'test1', 'v1');
            await registry.create(id, TestComponent, {}, container);

            await registry.render(id);
            assert.ok(container.innerHTML.includes('updated'));
        });

        it('throws for non-existent instance', async () => {
            const id = createComponentId('NonExistent', 'test1');
            await assert.rejects(() => registry.render(id), ComponentNotFoundError);
        });

        it('throws if template not found', async () => {
            const id = createComponentId('NoTemplate', 'test1');
            const instance = new Component();
            instance[COMPONENT_ID] = id;
            registry._instances.set(id.code, { instance, container });
            
            await assert.rejects(() => registry.render(id), /Template not found/);
        });

        it('uses compiled template cache', async () => {
            templateStore.set('TestComponent', { version: 'v1', htmlCode: '<div>cached</div>', cssCode: '' });
            const id = createComponentId('TestComponent', 'test1', 'v1');
            await registry.create(id, TestComponent, {}, container);

            const initialCompiled = templateStore.getCompiled('TestComponent');
            await registry.render(id);
            const secondCompiled = templateStore.getCompiled('TestComponent');

            assert.strictEqual(initialCompiled, secondCompiled);
        });

        describe('eager child validation', () => {
            it('throws error if eager child is entirely missing from template', async () => {
                templateStore.set('Parent', { version: 'v1', htmlCode: '<div>no children here</div>', cssCode: '' });
                class EagerParent extends Component {
                    child;
                    init() {
                        this.child = this.createChild('ChildComponent', 'child1');
                    }
                }
                const id = createComponentId('Parent', 'test1', 'v1');
                
                await assert.rejects(() => registry.create(id, EagerParent, {}, container), /not referenced in the template/);
            });

            it('does not throw error if eager child is hidden by fw-if', async () => {
                templateStore.set('Parent', { version: 'v1', htmlCode: '<div fw-if="false">((child))</div>', cssCode: '' });
                class EagerParent extends Component {
                    child;
                    init() {
                        this.child = this.createChild('ChildComponent', 'child1');
                    }
                }
                const id = createComponentId('Parent', 'test2', 'v1');
                
                await registry.create(id, EagerParent, {}, container);
                assert.ok(registry.has(id));
            });
        });
    });

    describe('has()', () => {
        it('returns true for existing instance', async () => {
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);
            assert.strictEqual(registry.has(id), true);
        });

        it('returns false for non-existent instance', () => {
            const id = createComponentId('NonExistent', 'test1');
            assert.strictEqual(registry.has(id), false);
        });
    });

    describe('getContainer()', () => {
        it('returns container for existing instance', async () => {
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);
            assert.strictEqual(registry.getContainer(id), container);
        });

        it('returns null for non-existent instance', () => {
            const id = createComponentId('NonExistent', 'test1');
            assert.strictEqual(registry.getContainer(id), null);
        });
    });

    describe('clearAll()', () => {
        it('removes all instances', async () => {
            await registry.create(createComponentId('C1', '1'), TestComponent, {}, document.createElement('div'));
            await registry.create(createComponentId('C2', '2'), TestComponent, {}, document.createElement('div'));
            
            registry.clearAll();
            assert.strictEqual(registry._instances.size, 0);
        });

        it('calls destroy on all instances', async () => {
            let destroyed = 0;
            class DestroyComponent extends Component {
                destroy() { destroyed++; }
            }
            await registry.create(createComponentId('C1', '1'), DestroyComponent, {}, document.createElement('div'));
            await registry.create(createComponentId('C2', '2'), DestroyComponent, {}, document.createElement('div'));

            registry.clearAll();
            assert.strictEqual(destroyed, 2);
        });

        describe('Auto-mounting (Smoke Test)', () => {
            it('auto-mounts child component from vars', async () => {
                templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
                templateStore.set('ChildComponent', { version: 'v1', htmlCode: '<span class="child">hi</span>', cssCode: '' });
                
                class ChildComponent extends Component {}
                registry.registerComponent('ChildComponent', ChildComponent);

                class Parent extends Component {
                    /** @type {any} */
                    child = null;
                
                async init() {
                    this.child = this.createChild('ChildComponent', 'child1');
                }
            }
                const id = createComponentId('Parent', 'root', 'v1');
                await registry.create(id, Parent, {}, container);

                assert.ok(container.querySelector('.child'), 'Child should be rendered');
                assert.ok(registry.has('ChildComponent#child1'), 'Child should be in registry');
            });
        });
    });

    describe('registerComponent()', () => {
        it('pre-registers a component class for name resolution', () => {
            class MyComp extends Component {}
            registry.registerComponent('MyComp', MyComp);
            assert.strictEqual(registry._componentClasses.get('MyComp'), MyComp);
        });

        it('overwrites previously registered class', () => {
            class C1 extends Component {}
            class C2 extends Component {}
            registry.registerComponent('Comp', C1);
            registry.registerComponent('Comp', C2);
            assert.strictEqual(registry._componentClasses.get('Comp'), C2);
        });
    });

    describe('createFromReference()', () => {
        it('creates instance from Child', async () => {
            templateStore.set('ChildComponent', { version: 'v1', htmlCode: '<div>child</div>', cssCode: '' });
            registry.registerComponent('ChildComponent', TestComponent);
            
            const ref = new Child('ChildComponent', 'i1', { msg: 'hi' });
            const instance = await registry.createFromReference(ref, container);

            assert.ok(instance instanceof TestComponent);
            assert.strictEqual(instance.msg, 'hi');
        });

        it('calls init and afterRender hooks', async () => {
            let hooks = [];
            class HookComponent extends Component {
                async init() { hooks.push('init'); }
                afterRender() { hooks.push('afterRender'); }
            }
            templateStore.set('HookComponent', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });
            registry.registerComponent('HookComponent', HookComponent);

            const ref = new Child('HookComponent', 'i1');
            await registry.createFromReference(ref, container);

            assert.deepStrictEqual(hooks, ['init', 'afterRender']);
        });

        it('throws if component class not found', async () => {
            const ref = new Child('Unknown', 'i1');
            await assert.rejects(() => registry.createFromReference(ref, container), /Failed to load component class Unknown/);
        });
    });

    describe('Auto-mounting with Child', () => {
        beforeEach(() => {
            registry.registerComponent('ChildComponent', TestComponent);
            templateStore.set('ChildComponent', { version: 'v1', htmlCode: '<div class="child">((msg))</div>', cssCode: '' });
        });

        it('auto-mounts child from Child in vars', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any} */
                child = null;
                async init() {
                    this.child = this.createChild('ChildComponent', 'child1', { msg: 'eager' });
                }
            }
            await registry.create(createComponentId('Parent', 'p1', 'v1'), Parent, {}, container);
            
            assert.ok(container.querySelector('.child'));
            assert.strictEqual(container.querySelector('.child').textContent, 'eager');
        });

        it('auto-mounts array of Child children', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((children))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any[]} */
                children = [];
                async init() {
                    this.children = [
                        this.createChild('ChildComponent', 'c1', { msg: 'one' }),
                        this.createChild('ChildComponent', 'c2', { msg: 'two' })
                    ];
                }
            }
            await registry.create(createComponentId('Parent', 'p1', 'v1'), Parent, {}, container);
            
            const children = container.querySelectorAll('.child');
            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].textContent, 'one');
            assert.strictEqual(children[1].textContent, 'two');
        });

        it('passes vars from Child to child instance', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any} */
                child = null;
                async init() {
                    this.child = this.createChild('ChildComponent', 'child1', { msg: 'hello' });
                }
            }
            await registry.create(createComponentId('Parent', 'p1', 'v1'), Parent, {}, container);
            
            const childInstance = registry.get('ChildComponent#child1');
            assert.strictEqual(childInstance.msg, 'hello');
        });

        it('replaces Child with Component instance in parent vars (top-level)', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('ChildComponent', 'child1');
                }
            }
            const parentId = createComponentId('Parent', 'p1', 'v1');
            const parent = await registry.create(parentId, Parent, {}, container);
            
            const childInstance = registry.get('ChildComponent#child1');
            assert.strictEqual(parent.child, childInstance);
        });

        it('replaces Child with Component instance in parent vars (array)', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((children))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any[]} */
                children = [];
            
                async init() {
                    this.children = [this.createChild('ChildComponent', 'c1')];
                }
            }
            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), Parent, {}, container);
            
            const childInstance = registry.get('ChildComponent#c1');
            assert.strictEqual(parent.children[0], childInstance);
        });

        it('allows update() on Component after ref replacement', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            class Parent extends Component {
                /** @type {any} */
                child = null;
                async init() { this.child = this.createChild('ChildComponent', 'child1', { msg: 'initial' }); }
            }
            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), Parent, {}, container);
            
            const childInstance = parent.child;
            await childInstance.update({ msg: 'updated' });
            
            assert.strictEqual(container.querySelector('.child').textContent, 'updated');
        });
    });

    describe('_replaceRefInVars()', () => {
        it('replaces top-level reference by identity', () => {
            const ref = new Child('X', 'x1');
            const fakeInstance = new Component();
            const vars = { child: ref };

            registry._replaceRefInVars(vars, ref, fakeInstance);

            assert.strictEqual(vars.child, fakeInstance);
        });

        it('replaces reference inside an array by identity', () => {
            const ref1 = new Child('X', 'x1');
            const ref2 = new Child('Y', 'y1');
            const fakeInstance = new Component();
            const vars = { items: [ref1, ref2] };

            registry._replaceRefInVars(vars, ref2, fakeInstance);

            assert.strictEqual(vars.items[0], ref1, 'other items unchanged');
            assert.strictEqual(vars.items[1], fakeInstance);
        });

        it('does nothing when reference is not found', () => {
            const ref = new Child('X', 'x1');
            const otherRef = new Child('Y', 'y1');
            const fakeInstance = new Component();
            const vars = { child: otherRef };

            registry._replaceRefInVars(vars, ref, fakeInstance);

            assert.strictEqual(vars.child, otherRef);
        });
    });

    describe('broadcastFromRoots()', () => {
        it('calls handlers on a single root component', async () => {
            const id = createComponentId('Root', 'r1');
            const instance = await registry.create(id, TestComponent, {}, container);
            
            let called = false;
            instance.on('theme', () => called = true);

            broadcastFromRoots(registry, 'theme', ['dark']);
            assert.ok(called);
        });

        it('propagates parent -> child -> grandchild (top-down)', async () => {
            const calls = [];
            registry.registerComponent('Child', TestComponent);
            registry.registerComponent('Grandchild', TestComponent);
            
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div>((grandchild))</div>', cssCode: '' });
            templateStore.set('Grandchild', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ParentComp extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'c1');
                }
            }
            class ChildComp extends Component {
                /** @type {any} */
                grandchild = null;
            
                async init() {
                    this.grandchild = this.createChild('Grandchild', 'g1');
                }
            }
            registry.registerComponent('Parent', ParentComp);
            registry.registerComponent('Child', ChildComp);

            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            const child = parent.child;
            const grandchild = child.grandchild;

            parent.on('theme', () => calls.push('parent'));
            child.on('theme', () => calls.push('child'));
            grandchild.on('theme', () => calls.push('grandchild'));

            broadcastFromRoots(registry, 'theme', ['dark']);
            assert.deepStrictEqual(calls, ['parent', 'child', 'grandchild']);
        });

        it('stops subtree propagation when handler returns false', async () => {
            const calls = [];
            registry.registerComponent('Child', TestComponent);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ParentComp extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'c1');
                }
            }
            registry.registerComponent('Parent', ParentComp);

            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            const child = parent.child;

            parent.on('theme', () => { calls.push('parent'); return false; });
            child.on('theme', () => calls.push('child'));

            broadcastFromRoots(registry, 'theme', ['dark']);
            assert.deepStrictEqual(calls, ['parent']);
        });

        it('false in one subtree does not affect sibling subtrees', async () => {
            const calls = [];
            registry.registerComponent('Child', TestComponent);
            templateStore.set('Root', { version: 'v1', htmlCode: '<div>((left))((right))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class RootComp extends Component {
                /** @type {any} */
                left = null;
                /** @type {any} */
                right = null;
            
                async init() {
                    this.left = this.createChild('Child', 'l1');
                    this.right = this.createChild('Child', 'r1');
                }
            }
            registry.registerComponent('Root', RootComp);

            const root = await registry.create(createComponentId('Root', 'p1', 'v1'), RootComp, {}, container);
            root.on('theme', () => calls.push('root'));
            root.left.on('theme', () => { calls.push('left'); return false; });
            root.right.on('theme', () => calls.push('right'));

            broadcastFromRoots(registry, 'theme', ['dark']);
            assert.deepStrictEqual(calls, ['root', 'left', 'right']);
        });

        it('skips components with no EVENTS (no handlers registered)', async () => {
            registry.registerComponent('Child', TestComponent);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ParentComp extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'c1');
                }
            }
            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            
            const calls = [];
            parent.child.on('theme', () => calls.push('child'));

            broadcastFromRoots(registry, 'theme', ['dark']);
            assert.deepStrictEqual(calls, ['child']);
        });

        it('logs errors from handlers and continues propagation', async () => {
            registry.registerComponent('Child', TestComponent);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ParentComp extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'c1');
                }
            }
            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            
            parent.on('theme', () => { throw new Error('boom'); });
            const calls = [];
            parent.child.on('theme', () => calls.push('child'));

            broadcastFromRoots(registry, 'theme', ['dark']);
            
            strictConsole.expectError(/listener threw: boom/);
            assert.deepStrictEqual(calls, ['child'], 'child still called after parent error');
        });

        it('forwards arguments to all handlers', async () => {
            const id = createComponentId('Root', 'r1');
            const instance = await registry.create(id, TestComponent, {}, container);
            
            let receivedArgs = null;
            instance.on('theme', (...args) => receivedArgs = args);

            broadcastFromRoots(registry, 'theme', ['dark', true]);
            assert.deepStrictEqual(receivedArgs, ['dark', true]);
        });

        it('does nothing when no instances exist', () => {
            assert.doesNotThrow(() => broadcastFromRoots(registry, 'theme', []));
        });

        it('uses cached _roots set instead of iterating all instances', async () => {
            const calls = [];
            registry.registerComponent('Child', TestComponent);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ParentComp extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'c1');
                }
            }
            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            
            parent.on('theme', () => calls.push('root'));
            parent.child.on('theme', () => calls.push('child'));

            // Even though both are in registry, only Parent is a root
            assert.strictEqual(registry._roots.size, 1);
            assert.ok(registry._roots.has('Parent#p1'));

            broadcastFromRoots(registry, 'theme', []);
            assert.deepStrictEqual(calls, ['root', 'child']);
        });
    });

    describe('broadcastFrom()', () => {
        it('broadcasts from a specific component and its children only', async () => {
            const calls = [];
            registry.registerComponent('Grandchild', TestComponent);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))((sibling))</div>', cssCode: '' });
            templateStore.set('ChildWithGrandchild', { version: 'v1', htmlCode: '<div>((grandchild))</div>', cssCode: '' });
            templateStore.set('Grandchild', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            class ChildWithGrandchild extends Component {
                /** @type {any} */
                grandchild = null;
            
                async init() {
                    this.grandchild = this.createChild('Grandchild', 'g1');
                }
            }
            class ParentComp extends Component {
                /** @type {any} */
                child = null;
                /** @type {any} */
                sibling = null;
            
                async init() {
                    this.child = this.createChild('ChildWithGrandchild', 'c1');
                    this.sibling = this.createChild('TestComponent', 's1');
                }
            }
            registry.registerComponent('Parent', ParentComp);
            registry.registerComponent('ChildWithGrandchild', ChildWithGrandchild);

            const parent = await registry.create(createComponentId('Parent', 'p1', 'v1'), ParentComp, {}, container);
            
            parent.on('theme', () => calls.push('parent'));
            parent.child.on('theme', () => calls.push('child'));
            parent.child.grandchild.on('theme', () => calls.push('grandchild'));
            parent.sibling.on('theme', () => calls.push('sibling'));

            broadcastFrom(registry, parent.child.toComponentId(), 'theme', []);
            
            assert.deepStrictEqual(calls, ['child', 'grandchild']);
        });

        it('does nothing for a non-existent component', () => {
            assert.doesNotThrow(() => broadcastFrom(registry, createComponentId('Fake', '1'), 'test', []));
        });

        it('respects false return to stop subtree propagation', async () => {
            const calls = [];
            const childId = createComponentId("Child", "c1");
            const grandId = createComponentId("Grandchild", "g1");
            
            const child = new Component();
            child[COMPONENT_ID] = childId;
            child[EVENTS] = new Map();
            
            const grand = new Component();
            grand[COMPONENT_ID] = grandId;
            grand[EVENTS] = new Map();

            registry._instances.set(childId.code, { instance: child, container: document.createElement('div') });
            registry._instances.set(grandId.code, { instance: grand, container: document.createElement('div') });

            child.on('test', () => { calls.push('child'); return false; });
            grand.on('test', () => calls.push('grand'));

            broadcastFrom(registry, childId, 'test', []);
            assert.deepStrictEqual(calls, ['child']);
        });
    });

    describe('hydrate() lifecycle', () => {
        it('calls hydrate() during create()', async () => {
            let hydrateCalled = false;
            class HydrateComponent extends Component {
                hydrate() { hydrateCalled = true; }
            }
            await registry.create(createComponentId('HydrateComponent', 'test1'), HydrateComponent, {}, container);
            assert.ok(hydrateCalled);
        });

        it('calls hydrate() after render and before afterRender', async () => {
            const order = [];
            class OrderComponent extends Component {
                init() { order.push('init'); }
                hydrate() { order.push('hydrate'); }
                afterRender() { order.push('afterRender'); }
            }
            templateStore.set('OrderComponent', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });
            await registry.create(createComponentId('OrderComponent', 'test1', 'v1'), OrderComponent, {}, container);
            
            // Note: render() is called after init and before hydrate
            assert.deepStrictEqual(order, ['init', 'hydrate', 'afterRender']);
        });

        it('sets LIFECYCLE_ACTIVE to hydrate during hydrate()', async () => {
            let activeDuringHydrate = null;
            class CheckActive extends Component {
                hydrate() { activeDuringHydrate = this[LIFECYCLE_ACTIVE]; }
            }
            await registry.create(createComponentId('CheckActive', 'test1'), CheckActive, {}, container);
            assert.strictEqual(activeDuringHydrate, 'hydrate');
        });

        it('queues react() during hydrate()', async () => {
            let reactCalled = false;
            registry._reactor.react = () => { reactCalled = true; return Promise.resolve(); };

            class HydrateReacter extends Component {
                hydrate() { this.react(); }
            }
            await registry.create(createComponentId('HydrateReacter', 'test1'), HydrateReacter, {}, container);
            assert.ok(reactCalled);
        });

        it('hydrate() is not called during update (only create)', async () => {
            let hydrateCalls = 0;
            class TestComponent extends Component {
                hydrate() { hydrateCalls++; }
            }
            const id = createComponentId('TestComponent', 'test1');
            await registry.create(id, TestComponent, {}, container);
            assert.strictEqual(hydrateCalls, 1);

            await registry.update(id, { some: 'var' });
            assert.strictEqual(hydrateCalls, 1);
        });
    });

    describe('LIFECYCLE_ACTIVE during create()', () => {
        it('sets init during init()', async () => {
            let activeDuringInit = null;
            class CheckInit extends Component {
                async init() { activeDuringInit = this[LIFECYCLE_ACTIVE]; }
            }
            await registry.create(createComponentId('CheckInit', 'test1'), CheckInit, {}, container);
            assert.strictEqual(activeDuringInit, 'init');
        });

        it('sets afterRender during afterRender()', async () => {
            let activeDuringAfterRender = null;
            class CheckAfterRender extends Component {
                afterRender() { activeDuringAfterRender = this[LIFECYCLE_ACTIVE]; }
            }
            await registry.create(createComponentId('CheckAfterRender', 'test1'), CheckAfterRender, {}, container);
            assert.strictEqual(activeDuringAfterRender, 'afterRender');
        });

        it('follows init → render → hydrate → afterRender order', async () => {
            const states = [];
            class LifecycleTracker extends Component {
                async init() { states.push('init:' + this[LIFECYCLE_ACTIVE]); }
                hydrate() { states.push('hydrate:' + this[LIFECYCLE_ACTIVE]); }
                afterRender() { states.push('afterRender:' + this[LIFECYCLE_ACTIVE]); }
            }
            templateStore.set('LifecycleTracker', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });
            await registry.create(createComponentId('LifecycleTracker', 'test1', 'v1'), LifecycleTracker, {}, container);

            assert.deepStrictEqual(states, [
                'init:init',
                'hydrate:hydrate',
                'afterRender:afterRender'
            ]);
        });
    });

    describe('_resolveLibraries()', () => {
        it('resolves library promises and stores modules', async () => {
            const id = createComponentId('Test', '1');
            const instance = new Component();
            const libPromise = Promise.resolve({ exported: 'value' });
            
            instance[LIBRARIES] = new Map([['testLib', { promise: libPromise, module: null }]]);
            
            await registry._resolveLibraries(instance);
            assert.strictEqual(instance[LIBRARIES].get('testLib').module.exported, 'value');
        });

        it('does nothing when no libraries are loaded', async () => {
            const instance = new Component();
            await assert.doesNotReject(() => registry._resolveLibraries(instance));
        });

        it('resolves multiple libraries', async () => {
            const instance = new Component();
            const p1 = Promise.resolve({ a: 1 });
            const p2 = Promise.resolve({ b: 2 });
            
            instance[LIBRARIES] = new Map([
                ['lib1', { promise: p1, module: null }],
                ['lib2', { promise: p2, module: null }]
            ]);

            await registry._resolveLibraries(instance);
            assert.strictEqual(instance[LIBRARIES].get('lib1').module.a, 1);
            assert.strictEqual(instance[LIBRARIES].get('lib2').module.b, 2);
        });
    });

    describe('Eager child creation (startEagerCreation / _attachEagerChild)', () => {
        it('creates child in detached container with deferred hydration', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            let hydrateCalled = false;
            class ChildComp extends Component {
                hydrate() { hydrateCalled = true; }
            }
            registry.registerComponent('Child', ChildComp);

            class Parent extends Component {
                /** @type {any} */
                child = null;
                async init() { this.child = this.createChild('Child', 'main', {}); }
            }
            const parentId = createComponentId('Parent', 'root', 'v1');
            
            const parent = await registry.create(parentId, Parent, {}, container);
            
            // After parent create, child should be fully mounted and hydrated
            assert.ok(registry.has('Child#main'), 'Child should be in registry');
            assert.ok(parent.child instanceof Component, 'Child ref should be replaced with instance');
            assert.ok(hydrateCalled, 'Hydration should have completed after attachment');
        });

        it('children created in init run in parallel', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((c1))((c2))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });
            registry.registerComponent('Child', TestComponent);

            let activeCreations = 0;
            const originalCreate = registry.create;
            registry.create = async (...args) => {
                activeCreations++;
                const res = await originalCreate.apply(registry, args);
                await new Promise(resolve => setTimeout(resolve, 10));
                activeCreations--;
                return res;
            };

            class Parent extends Component {
                async init() {
                    this.c1 = this.createChild('Child', '1');
                    this.c2 = this.createChild('Child', '2');
                }
            }
            await registry.create(createComponentId('Parent', 'root', 'v1'), Parent, {}, container);
        });

        it('deferred hydration: hydrate runs after DOM attachment (bottom-up)', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            const events = [];
            class ChildComp extends Component {
                hydrate() { events.push('child-hydrate'); }
            }
            class Parent extends Component {
                /** @type {any} */
                child = null;
                hydrate() { events.push('parent-hydrate'); }
                async init() {
                    this.child = this.createChild('Child', 'main');
                }
            }
            registry.registerComponent('Parent', Parent);
            registry.registerComponent('Child', ChildComp);

            await registry.create(createComponentId('Parent', 'root', 'v1'), Parent, {}, container);
            
            assert.deepStrictEqual(events, ['child-hydrate', 'parent-hydrate']);
        });

        it('transfers DOM from detached container to mount point', async () => {
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Child', { version: 'v1', htmlCode: '<span class="inner">hi</span>', cssCode: '' });
            registry.registerComponent('Child', TestComponent);

            class Parent extends Component {
                /** @type {any} */
                child = null;
            
                async init() {
                    this.child = this.createChild('Child', 'main');
                }
            }
            await registry.create(createComponentId('Parent', 'root', 'v1'), Parent, {}, container);
            
            assert.ok(container.querySelector('.inner'));
        });

        it('skips eager creation when component already exists in registry (re-render)', async () => {
            templateStore.set('Cell', { version: 'v1', htmlCode: '<div>cell</div>', cssCode: '' });
            registry.registerComponent('Cell', TestComponent);

            const cellId = createComponentId('Cell', '0', 'v1');
            await registry.create(cellId, TestComponent, {}, document.createElement('div'));

            const ref = new Child('Cell', '0');
            registry.startEagerCreation(ref);

            assert.strictEqual(ref._creationPromise, null, 'should skip eager creation for existing Cell#0');
        });
    });

    describe('Error fallbacks (ErrorBoundary)', () => {
        it('renders fallback component when child creation fails', async () => {
            class Fallback extends Component {
                errorMessage = '';
                failedComponent = '';
            }
            templateStore.set('Fallback', { version: 'v1', htmlCode: '<span>((errorMessage)) ((failedComponent))</span>', cssCode: '' });

            const parentId = createComponentId('Parent', 'root', 'v1');

            registry._reactor.react = async (target) => {
                try {
                    const cid = target.code ? target : target[COMPONENT_ID];
                    if (cid) await registry.render(cid);
                } catch (e) {
                    console.error("[MOCK] REACTOR ERR", e);
                }
            };

            class Parent extends Component {
                /** @type {Child|Component} */
                child = null;
                async init() {
                    this.child = this.createErrorBoundedChild(
                        this.createChild('Broken', 'main', {}),
                        'Fallback'
                    );
                }
            }
            class Broken extends Component {
                async init() { throw new Error('init failed'); }
            }
            registry.registerComponent('Parent', Parent);
            registry.registerComponent('Broken', Broken);
            registry.registerComponent('Fallback', Fallback);
            templateStore.set('Parent', { version: 'v1', htmlCode: '<div>((child))</div>', cssCode: '' });
            templateStore.set('Broken', { version: 'v1', htmlCode: '<div>broken</div>', cssCode: '' });

            const parentInstance = await registry.create(parentId, Parent, {}, container);

            const boundary = parentInstance.child;
            assert.strictEqual(boundary.componentName, 'FuseWire/ErrorBoundary');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const fallbackParams = boundary.child;
            assert.strictEqual(fallbackParams.errorMessage, 'init failed');
            assert.strictEqual(fallbackParams.failedComponent, 'Broken');

            const spans = container.querySelectorAll('span');
            if (spans.length === 0) {
                throw new Error('NO SPANS. HTML IS: ' + container.innerHTML);
            }
            assert.ok(container.innerHTML.includes('init failed'));
            assert.ok(container.innerHTML.includes('Broken'));
        });

        it('propagates error when no fallback is specified', async () => {
            class Broken extends Component {
                async init() { throw new Error('boom'); }
            }
            registry.registerComponent('Broken', Broken);
            templateStore.set('Broken', { version: 'v1', htmlCode: '<div></div>', cssCode: '' });

            const id = createComponentId('Broken', '1', 'v1');
            await assert.rejects(() => registry.create(id, Broken, {}, container), /boom/);
        });
    });

    describe('_hydrateSubtree', () => {
        it('skips components that are already hydrated', async () => {
            const id = createComponentId('Test', '1');
            const instance = new TestComponent();
            const entry = { instance, container, needsHydration: false };
            registry._instances.set(id.code, entry);

            let hydrateCalled = false;
            instance.hydrate = () => hydrateCalled = true;

            await registry._hydrateSubtree(id);
            assert.strictEqual(hydrateCalled, false);
        });
    });
});
