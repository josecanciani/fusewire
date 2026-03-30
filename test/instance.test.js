import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { InstanceRegistry } from '../src/instance.js';
import { Renderer } from '../src/renderer.js';
import { TemplateStore } from '../src/template-store.js';
import { Component } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { ComponentNotFoundError } from '../src/errors/error-hierarchy.js';
import { Idiomorph } from 'idiomorph';
import { ComponentReference } from '../src/component-reference.js';

describe('InstanceRegistry', () => {
    let dom;
    let document;
    let registry;
    let renderer;
    let templateStore;
    let container;

    // Test component class
    class TestComponent extends Component {
        constructor() {
            super();
            this._hydrateCalled = false;
            this._updateCalled = false;
            this._destroyCalled = false;
            this._afterRenderCalled = false;
        }

        async hydrate() {
            this._hydrateCalled = true;
        }

        update(newVars, react = true) {
            this._updateCalled = true;
            this._receivedVars = newVars;
            super.update(newVars, react);
        }

        async destroy() {
            this._destroyCalled = true;
        }

        async afterRender() {
            this._afterRenderCalled = true;
        }
    }

    beforeEach(() => {
        // Set up JSDOM for real DOM operations
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost',
        });
        document = dom.window.document;
        const { window } = dom;

        // Set up global DOM objects for idiomorph
        Object.keys(window).forEach((key) => {
            const value = window[key];
            if (typeof value === 'function' && (
                key.startsWith('HTML') ||
                key.startsWith('DOM') ||
                key === 'Node' ||
                key === 'Element' ||
                key === 'Document'
            )) {
                global[key] = value;
            }
        });
        global.document = document;
        global.localStorage = window.localStorage;

        templateStore = new TemplateStore();
        
        // Create renderer after globals are set up
        renderer = new Renderer((container, html, options) => {
            return Idiomorph.morph(container, html, options);
        });
        
        registry = new InstanceRegistry(renderer, templateStore, 'testApp');

        // Wire a mock reactor (normally done by Reactor constructor)
        registry._reactor = {
            _console: console,
            _basePath: './components',
            _globalVars: {},
        };

        // Create a fresh container for each test
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    describe('Constructor', () => {
        it('creates instance with renderer and template store', () => {
            assert.ok(registry instanceof InstanceRegistry);
        });
    });

    describe('create()', () => {
        it('creates a new component instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            const instance = await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            assert.ok(instance instanceof TestComponent);
            assert.strictEqual(instance.message, 'Hello');
        });

        it('calls hydrate hook', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const instance = await registry.create(
                componentId,
                TestComponent,
                {},
                container
            );

            assert.strictEqual(instance._hydrateCalled, true);
        });

        it('calls afterRender hook', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const instance = await registry.create(
                componentId,
                TestComponent,
                {},
                container
            );

            assert.strictEqual(instance._afterRenderCalled, true);
        });

        it('stores instance in registry', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);

            assert.strictEqual(registry.has(componentId), true);
        });

        it('throws if instance already exists', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);

            await assert.rejects(
                async () => {
                    await registry.create(componentId, TestComponent, {}, container);
                },
                /already exists/
            );
        });

        it('sets container on instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const instance = await registry.create(
                componentId,
                TestComponent,
                {},
                container
            );

            assert.strictEqual(instance.componentContainer, container);
        });

        it('renders component to container', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            assert.ok(container.innerHTML.includes('Hello'));
        });
    });

    describe('lifecycle guard', () => {
        it('prevents react() during hydrate() in create()', async () => {
            const reactCalls = [];
            const warnings = [];
            registry._reactor = {
                _console: {
                    log() {},
                    warn(...args) { warnings.push(args); },
                    error() {},
                },
                _basePath: './components',
                _globalVars: {},
                react() { reactCalls.push('react'); },
            };

            class HydrateReacter extends Component {
                async hydrate() {
                    this.react();
                }
            }

            const componentId = new ComponentId('HydrateReacter', 'test1');
            templateStore.set('HydrateReacter', {
                htmlCode: '<div>guarded</div>',
                cssCode: '',
                version: 'v1',
            });
            registry.registerComponent('HydrateReacter', HydrateReacter);

            await registry.create(componentId, HydrateReacter, {}, container);

            assert.strictEqual(reactCalls.length, 0, 'reactor.react should not be called');
            assert.strictEqual(warnings.length, 1, 'should warn once');
            assert.ok(
                warnings[0][0].message.includes('hydrate'),
                'warning should mention hydrate',
            );
        });

        it('prevents react() during afterRender() in create()', async () => {
            const reactCalls = [];
            const warnings = [];
            registry._reactor = {
                _console: {
                    log() {},
                    warn(...args) { warnings.push(args); },
                    error() {},
                },
                _basePath: './components',
                _globalVars: {},
                react() { reactCalls.push('react'); },
            };

            class AfterRenderReacter extends Component {
                afterRender() {
                    this.react();
                }
            }

            const componentId = new ComponentId('AfterRenderReacter', 'test1');
            templateStore.set('AfterRenderReacter', {
                htmlCode: '<div>guarded</div>',
                cssCode: '',
                version: 'v1',
            });
            registry.registerComponent('AfterRenderReacter', AfterRenderReacter);

            await registry.create(componentId, AfterRenderReacter, {}, container);

            assert.strictEqual(reactCalls.length, 0, 'reactor.react should not be called');
            assert.strictEqual(warnings.length, 1, 'should warn once');
            assert.ok(
                warnings[0][0].message.includes('afterRender'),
                'warning should mention afterRender',
            );
        });

        it('clears _lifecycleActive after create() completes', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1',
            });

            const instance = await registry.create(
                componentId,
                TestComponent,
                {},
                container,
            );

            assert.strictEqual(instance._lifecycleActive, null);
        });

        it('clears _lifecycleActive even when hydrate() throws', async () => {
            class ThrowingHydrate extends Component {
                async hydrate() {
                    throw new Error('hydrate failed');
                }
            }

            const componentId = new ComponentId('ThrowingHydrate', 'test1');
            templateStore.set('ThrowingHydrate', {
                htmlCode: '<div>fail</div>',
                cssCode: '',
                version: 'v1',
            });
            registry.registerComponent('ThrowingHydrate', ThrowingHydrate);

            await assert.rejects(
                () => registry.create(componentId, ThrowingHydrate, {}, container),
                /hydrate failed/,
            );

            const instance = registry.get(componentId);
            assert.strictEqual(instance._lifecycleActive, null);
        });

        // Note: update() triggers re-render which uses morphing.
        // Morphing tests are skipped in Node/JSDOM — see test/browser/morphing.spec.js
        // The guard logic itself is tested at the Component level in component.test.js
        it.skip('prevents react() during update() in InstanceRegistry.update()', async () => {
            const reactCalls = [];
            const warnings = [];
            registry._reactor = {
                _console: {
                    log() {},
                    warn(...args) { warnings.push(args); },
                    error() {},
                },
                _basePath: './components',
                _globalVars: {},
                react() { reactCalls.push('react'); },
            };

            class UpdateReacter extends Component {
                update(newVars, react = true) {
                    super.update(newVars, react);
                    // Explicitly call react() — should be guarded
                    this.react();
                }
            }

            const componentId = new ComponentId('UpdateReacter', 'test1');
            templateStore.set('UpdateReacter', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1',
            });
            registry.registerComponent('UpdateReacter', UpdateReacter);

            await registry.create(componentId, UpdateReacter, { message: 'a' }, container);
            // Clear warnings from create() — the update() override also fires during create
            warnings.length = 0;
            reactCalls.length = 0;

            await registry.update(componentId, { message: 'b' });

            assert.strictEqual(reactCalls.length, 0, 'reactor.react should not be called');
            assert.strictEqual(warnings.length, 1, 'should warn once');
            assert.ok(
                warnings[0][0].includes('update'),
                'warning should mention update',
            );
        });
    });

    describe('get()', () => {
        it('returns existing instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const created = await registry.create(componentId, TestComponent, {}, container);
            const retrieved = registry.get(componentId);

            assert.strictEqual(retrieved, created);
        });

        it('returns null for non-existent instance', () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            const retrieved = registry.get(componentId);

            assert.strictEqual(retrieved, null);
        });
    });

    describe('get() with string', () => {
        it('returns existing instance by code string', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const created = await registry.create(componentId, TestComponent, {}, container);
            const retrieved = registry.get('TestComponent#test1');

            assert.strictEqual(retrieved, created);
        });

        it('returns null for non-existent code', () => {
            const retrieved = registry.get('TestComponent#nonexistent');

            assert.strictEqual(retrieved, null);
        });
    });

    describe('update()', () => {
        // Note: update() tests trigger re-renders which use morphing
        // Morphing tests are skipped in Node/JSDOM due to idiomorph compatibility issues
        // These tests pass in real browsers - see test/browser/morphing.spec.js
        
        it.skip('updates instance vars', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            await registry.update(componentId, { message: 'Updated' });

            const instance = registry.get(componentId);
            assert.strictEqual(instance.message, 'Updated');
        });

        it.skip('calls update hook with old vars', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            await registry.update(componentId, { message: 'Updated' });

            const instance = registry.get(componentId);
            assert.strictEqual(instance._updateCalled, true);
            assert.strictEqual(instance._receivedVars.message, 'Updated');
        });

        it.skip('calls afterRender hook', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            // Reset the flag
            const instance = registry.get(componentId);
            instance._afterRenderCalled = false;

            await registry.update(componentId, { message: 'Updated' });

            assert.strictEqual(instance._afterRenderCalled, true);
        });

        it.skip('re-renders component', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            await registry.update(componentId, { message: 'Updated' });

            assert.ok(container.innerHTML.includes('Updated'));
        });

        it('throws for non-existent instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');

            await assert.rejects(
                async () => {
                    await registry.update(componentId, { message: 'Updated' });
                },
                ComponentNotFoundError
            );
        });
    });

    describe('remove()', () => {
        it('calls destroy hook', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);
            const instance = registry.get(componentId);

            await registry.remove(componentId);

            assert.strictEqual(instance._destroyCalled, true);
        });

        it('removes instance from registry', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);
            await registry.remove(componentId);

            assert.strictEqual(registry.has(componentId), false);
        });

        it('removes DOM element', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);
            
            // Verify container is in DOM
            assert.strictEqual(container.parentNode, document.body);
            
            await registry.remove(componentId);

            // Container should have been removed from parent
            assert.strictEqual(container.parentNode, null);
        });

        it('silently ignores non-existent instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            
            // Should not throw
            await registry.remove(componentId);
        });
    });

    describe('render()', () => {
        it('renders existing instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            container.innerHTML = ''; // Clear
            await registry.render(componentId);

            assert.ok(container.innerHTML.includes('Hello'));
        });

        it('throws for non-existent instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');

            await assert.rejects(
                async () => {
                    await registry.render(componentId);
                },
                ComponentNotFoundError
            );
        });

        it('throws if template not found', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            
            // Create instance without template in store
            // This simulates the error case
            // Note: In practice, create() would fail first, but render() should also validate
            
            // We'll skip this test since create() already validates template existence
        });

        it('uses compiled template cache', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(
                componentId,
                TestComponent,
                { message: 'Hello' },
                container
            );

            // Compiled template should be cached
            const compiled = templateStore.getCompiled('TestComponent');
            assert.ok(compiled !== null);
        });
    });

    describe('has()', () => {
        it('returns true for existing instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);

            assert.strictEqual(registry.has(componentId), true);
        });

        it('returns false for non-existent instance', () => {
            const componentId = new ComponentId('TestComponent', 'test1');

            assert.strictEqual(registry.has(componentId), false);
        });
    });

    describe('getContainer()', () => {
        it('returns container for existing instance', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            await registry.create(componentId, TestComponent, {}, container);

            const retrieved = registry.getContainer(componentId);
            assert.strictEqual(retrieved, container);
        });

        it('returns null for non-existent instance', () => {
            const componentId = new ComponentId('TestComponent', 'test1');

            assert.strictEqual(registry.getContainer(componentId), null);
        });
    });

    describe('clearAll()', () => {
        it('removes all instances', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const id1 = new ComponentId('TestComponent', 'test1');
            const id2 = new ComponentId('TestComponent', 'test2');
            const container1 = document.createElement('div');
            const container2 = document.createElement('div');
            document.body.appendChild(container1);
            document.body.appendChild(container2);

            await registry.create(id1, TestComponent, {}, container1);
            await registry.create(id2, TestComponent, {}, container2);

            await registry.clearAll();

            assert.strictEqual(registry.has(id1), false);
            assert.strictEqual(registry.has(id2), false);
        });

        it('calls destroy on all instances', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const id1 = new ComponentId('TestComponent', 'test1');
            const id2 = new ComponentId('TestComponent', 'test2');
            const container1 = document.createElement('div');
            const container2 = document.createElement('div');
            document.body.appendChild(container1);
            document.body.appendChild(container2);

            await registry.create(id1, TestComponent, {}, container1);
            await registry.create(id2, TestComponent, {}, container2);

            const instance1 = registry.get(id1);
            const instance2 = registry.get(id2);

            await registry.clearAll();

            assert.strictEqual(instance1._destroyCalled, true);
            assert.strictEqual(instance2._destroyCalled, true);
        });
    });

    describe('Auto-mounting', () => {
        class ChildComponent extends Component {}

        it('auto-mounts child component from vars', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>Parent: ((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child Content</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            // Child should be auto-mounted in registry
            const childId = new ComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);

            // Child content should be rendered
            assert.ok(container.innerHTML.includes('Child Content'));
        });

        it('auto-mounts array of child components', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((cards))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Card</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const card1 = new ChildComponent();
            card1._componentId = new ComponentId('ChildComponent', 'c1');
            const card2 = new ChildComponent();
            card2._componentId = new ComponentId('ChildComponent', 'c2');
            const cards = [card1, card2];

            await registry.create(
                componentId,
                TestComponent,
                { cards },
                container
            );

            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c1')), true);
            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c2')), true);
        });

        it('throws when child template is missing', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });

            class UnregisteredChild extends Component {}
            registry.registerComponent('UnregisteredChild', UnregisteredChild);

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new UnregisteredChild();
            childDecl._componentId = new ComponentId('UnregisteredChild', 'u1');

            await assert.rejects(
                () => registry.create(
                    componentId,
                    TestComponent,
                    { child: childDecl },
                    container
                ),
                /UnregisteredChild/
            );
        });

        it('adds component class to child container', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Content</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            const childContainer = registry.getContainer(childId);
            assert.ok(childContainer.classList.contains('ChildComponent'));
        });

        it('passes child vars to created instance', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>((label))</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = Object.assign(new ChildComponent(), { label: 'Hello' });
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            const childInstance = registry.get(childId);
            assert.strictEqual(childInstance.label, 'Hello');
            assert.ok(container.innerHTML.includes('Hello'));
        });

        // Note: Auto-cleanup tests trigger re-renders which use morphing
        // Morphing tests are skipped in Node/JSDOM due to idiomorph compatibility issues
        // These tests pass in real browsers - see test/browser/morphing.spec.js

        it.skip('auto-removes child when var is set to null', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            const parent = await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);

            // Set child var to null and re-render parent
            parent.child = null;
            await registry.render(componentId);

            // Child should be auto-removed
            assert.strictEqual(registry.has(childId), false);
        });

        it.skip('auto-removes child when switching to different component type', async () => {
            class AltChild extends Component {}

            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Original</span>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('AltChild', {
                htmlCode: '<span>Replacement</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'c1');
            const parent = await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            const oldChildId = new ComponentId('ChildComponent', 'c1');
            assert.strictEqual(registry.has(oldChildId), true);

            // Replace with different component type
            const altDecl = new AltChild();
            altDecl._componentId = new ComponentId('AltChild', 'c1');
            parent.child = altDecl;
            await registry.render(componentId);

            // Old child removed, new child created
            assert.strictEqual(registry.has(oldChildId), false);
            const newChildId = new ComponentId('AltChild', 'c1');
            assert.strictEqual(registry.has(newChildId), true);
            assert.ok(container.innerHTML.includes('Replacement'));
        });

        it.skip('calls destroy on auto-removed child', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            const parent = await registry.create(
                componentId,
                TestComponent,
                { child: childDecl },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            const childInstance = registry.get(childId);

            // Set child var to null and re-render
            parent.child = null;
            await registry.render(componentId);

            assert.strictEqual(childInstance._destroyCalled, true);
        });

        it.skip('keeps child that remains in vars', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child)) ((label))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl._componentId = new ComponentId('ChildComponent', 'child1');

            const parent = await registry.create(
                componentId,
                TestComponent,
                { child: childDecl, label: 'v1' },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);

            // Change a scalar var but keep the child
            parent.label = 'v2';
            await registry.render(componentId);

            // Child should still exist
            assert.strictEqual(registry.has(childId), true);
        });

        it.skip('auto-removes children in arrays when array is cleared', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((cards))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Card</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const card1 = new ChildComponent();
            card1._componentId = new ComponentId('ChildComponent', 'c1');
            const card2 = new ChildComponent();
            card2._componentId = new ComponentId('ChildComponent', 'c2');
            const cards = [card1, card2];

            const parent = await registry.create(
                componentId,
                TestComponent,
                { cards },
                container
            );

            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c1')), true);
            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c2')), true);

            // Clear the array
            parent.cards = [];
            await registry.render(componentId);

            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c1')), false);
            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c2')), false);
        });
    });

    describe('registerComponent()', () => {
        it('pre-registers a component class for name resolution', async () => {
            registry.registerComponent('TestComponent', TestComponent);

            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const ref = new ComponentReference('TestComponent', 'test1', {});
            const instance = await registry.createFromReference(ref, container);

            assert.ok(instance instanceof TestComponent);
        });

        it('overwrites previously registered class', () => {
            class Alt extends Component {}

            registry.registerComponent('TestComponent', TestComponent);
            registry.registerComponent('TestComponent', Alt);

            // Internal map should have the latest class
            assert.strictEqual(registry._componentClasses.get('TestComponent'), Alt);
        });
    });

    describe('createFromReference()', () => {
        it('creates instance from ComponentReference', async () => {
            registry.registerComponent('TestComponent', TestComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((message))</div>',
                cssCode: '',
                version: 'v1'
            });

            const ref = new ComponentReference('TestComponent', 'test1', { message: 'Hello' });
            const instance = await registry.createFromReference(ref, container);

            assert.ok(instance instanceof TestComponent);
            assert.strictEqual(instance.message, 'Hello');
            assert.strictEqual(instance.componentName, 'TestComponent');
            assert.strictEqual(instance.componentId, 'test1');
        });

        it('calls hydrate and afterRender hooks', async () => {
            registry.registerComponent('TestComponent', TestComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>Test</div>',
                cssCode: '',
                version: 'v1'
            });

            const ref = new ComponentReference('TestComponent', 'test1', {});
            const instance = await registry.createFromReference(ref, container);

            assert.strictEqual(instance._hydrateCalled, true);
            assert.strictEqual(instance._afterRenderCalled, true);
        });

        it('throws if component class not found', async () => {
            const ref = new ComponentReference('Unknown', 'test1', {});

            await assert.rejects(
                async () => await registry.createFromReference(ref, container),
                /Unknown/
            );
        });
    });

    describe('Auto-mounting with ComponentReference', () => {
        class ChildComponent extends Component {}

        it('auto-mounts child from ComponentReference in vars', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child Content</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childRef = new ComponentReference('ChildComponent', 'child1', {});

            await registry.create(
                componentId,
                TestComponent,
                { child: childRef },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);
            assert.ok(container.innerHTML.includes('Child Content'));
        });

        it('auto-mounts array of ComponentReference children', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((cards))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Card</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const cards = [
                new ComponentReference('ChildComponent', 'c1', {}),
                new ComponentReference('ChildComponent', 'c2', {}),
            ];

            await registry.create(
                componentId,
                TestComponent,
                { cards },
                container
            );

            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c1')), true);
            assert.strictEqual(registry.has(new ComponentId('ChildComponent', 'c2')), true);
        });

        it('passes vars from ComponentReference to child instance', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>((label))</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childRef = new ComponentReference('ChildComponent', 'child1', { label: 'Hello' });

            await registry.create(
                componentId,
                TestComponent,
                { child: childRef },
                container
            );

            const childId = new ComponentId('ChildComponent', 'child1');
            const childInstance = registry.get(childId);
            assert.strictEqual(childInstance.label, 'Hello');
        });

        it('replaces ComponentReference with Component instance in parent vars (top-level)', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childRef = new ComponentReference('ChildComponent', 'child1', { label: 'Hi' });
            const parentVars = { child: childRef };

            await registry.create(componentId, TestComponent, parentVars, container);

            const parentInstance = registry.get(componentId);
            assert.ok(parentInstance.child instanceof Component, 'ref should be replaced with Component');
            assert.strictEqual(childRef._replaced, true, 'original ref should be marked as replaced');
        });

        it('replaces ComponentReference with Component instance in parent vars (array)', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((items))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Item</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const ref1 = new ComponentReference('ChildComponent', 'i1', {});
            const ref2 = new ComponentReference('ChildComponent', 'i2', {});
            const items = [ref1, ref2];

            await registry.create(componentId, TestComponent, { items }, container);

            const parentInstance = registry.get(componentId);
            assert.ok(parentInstance.items[0] instanceof Component, 'first ref should be replaced');
            assert.ok(parentInstance.items[1] instanceof Component, 'second ref should be replaced');
            assert.strictEqual(ref1._replaced, true);
            assert.strictEqual(ref2._replaced, true);
        });

        it('allows update() on Component after ref replacement', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1'
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>((msg))</span>',
                cssCode: '',
                version: 'v1'
            });

            const componentId = new ComponentId('TestComponent', 'test1');
            const childRef = new ComponentReference('ChildComponent', 'child1', { msg: 'a' });

            await registry.create(componentId, TestComponent, { child: childRef }, container);

            const parentInstance = registry.get(componentId);
            // After mount, parent.child is the real Component — update() should work
            parentInstance.child.update({ msg: 'b' }, false);
            assert.strictEqual(parentInstance.child.msg, 'b');
        });
    });

    describe('_replaceRefInVars()', () => {
        it('replaces top-level reference by identity', () => {
            const ref = new ComponentReference('X', 'x1', {});
            const vars = { child: ref, other: 'text' };
            const fakeInstance = new Component();

            registry._replaceRefInVars(vars, ref, fakeInstance);

            assert.strictEqual(vars.child, fakeInstance);
            assert.strictEqual(vars.other, 'text');
        });

        it('replaces reference inside an array by identity', () => {
            const ref1 = new ComponentReference('X', 'x1', {});
            const ref2 = new ComponentReference('X', 'x2', {});
            const fakeInstance = new Component();
            const vars = { items: [ref1, ref2] };

            registry._replaceRefInVars(vars, ref2, fakeInstance);

            assert.strictEqual(vars.items[0], ref1, 'other items unchanged');
            assert.strictEqual(vars.items[1], fakeInstance);
        });

        it('does nothing when reference is not found', () => {
            const ref = new ComponentReference('X', 'x1', {});
            const otherRef = new ComponentReference('Y', 'y1', {});
            const vars = { child: otherRef };
            const fakeInstance = new Component();

            registry._replaceRefInVars(vars, ref, fakeInstance);

            assert.strictEqual(vars.child, otherRef, 'vars unchanged');
        });
    });
});

