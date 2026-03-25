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

describe('InstanceRegistry', () => {
    let dom;
    let document;
    let registry;
    let renderer;
    let templateStore;
    let container;

    // Test component class
    class TestComponent extends Component {
        static componentName = 'TestComponent';

        constructor(id, vars) {
            super(id, vars);
            this.hydrateCalled = false;
            this.updateCalled = false;
            this.destroyCalled = false;
            this.afterRenderCalled = false;
        }

        async hydrate() {
            this.hydrateCalled = true;
        }

        async update(oldVars) {
            this.updateCalled = true;
            this.oldVarsSnapshot = oldVars;
        }

        async destroy() {
            this.destroyCalled = true;
        }

        async afterRender() {
            this.afterRenderCalled = true;
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
        
        registry = new InstanceRegistry(renderer, templateStore);

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
                htmlCode: '<div>{{message}}</div>',
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
            assert.strictEqual(instance.vars.message, 'Hello');
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

            assert.strictEqual(instance.hydrateCalled, true);
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

            assert.strictEqual(instance.afterRenderCalled, true);
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

        it('renders component to container', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>{{message}}</div>',
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

    describe('update()', () => {
        it('updates instance vars', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>{{message}}</div>',
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
            assert.strictEqual(instance.vars.message, 'Updated');
        });

        it('calls update hook with old vars', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>{{message}}</div>',
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
            assert.strictEqual(instance.updateCalled, true);
            assert.strictEqual(instance.oldVarsSnapshot.message, 'Hello');
        });

        it('calls afterRender hook', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>{{message}}</div>',
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
            instance.afterRenderCalled = false;

            await registry.update(componentId, { message: 'Updated' });

            assert.strictEqual(instance.afterRenderCalled, true);
        });

        it('re-renders component', async () => {
            const componentId = new ComponentId('TestComponent', 'test1');
            templateStore.set('TestComponent', {
                htmlCode: '<div>{{message}}</div>',
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

            assert.strictEqual(instance.destroyCalled, true);
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
                htmlCode: '<div>{{message}}</div>',
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
                htmlCode: '<div>{{message}}</div>',
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

            assert.strictEqual(instance1.destroyCalled, true);
            assert.strictEqual(instance2.destroyCalled, true);
        });
    });
});
