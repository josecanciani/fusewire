import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { InstanceRegistry } from '../src/instance.js';
import { Renderer } from '../src/renderer.js';
import { TemplateStore } from '../src/template-store.js';
import { Component } from '../src/component.js';
import { createComponentId, componentIdFromCode, componentIdsEqual } from '../src/component-id.js';
import { Child } from '../src/component.js';
import { Idiomorph } from 'idiomorph';
import { COMPONENT_ID } from '../src/symbols.js';
import { StateSerializer } from '../src/state-serializer.js';
import { Persistence } from '../src/persistence.js';

describe('InstanceRegistry Mounting Thoroughness', () => {
    let dom;
    let document;
    let registry;
    let renderer;
    let templateStore;
    let container;

    class TestComponent extends Component { }
    class ChildComponent extends Component { }

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost',
        });
        document = dom.window.document;
        const { window } = dom;

        // Ensure Document and other core types are in global scope for idiomorph/jsdom
        global.Document = window.Document;
        global.Node = window.Node;
        global.Element = window.Element;
        global.HTMLElement = window.HTMLElement;
        global.document = document;
        global.localStorage = window.localStorage;

        templateStore = new TemplateStore();
        // Use a simple innerHTML morph for JSDOM performance tests to avoid idiomorph compatibility issues.
        // Real morphing is tested in browser tests.
        renderer = new Renderer((container, html) => {
            container.innerHTML = html;
        });
        registry = new InstanceRegistry(
            renderer,
            templateStore,
            'testApp',
            new Persistence(new StateSerializer())
        );

        registry._reactor = {
            console: console,
            basePath: './components',
            globalVars: {},
            instanceRegistry: registry,
            persistence: registry.persistence,
        };

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    describe('Auto-mounting Scenarios', () => {
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

            const parentId = createComponentId('TestComponent', 'test1');
            const card1 = new ChildComponent();
            card1[COMPONENT_ID] = createComponentId('ChildComponent', 'c1');
            const card2 = new ChildComponent();
            card2[COMPONENT_ID] = createComponentId('ChildComponent', 'c2');
            const cards = [card1, card2];

            await registry.create(parentId, TestComponent, { cards }, container);

            assert.strictEqual(registry.has(createComponentId('ChildComponent', 'c1')), true);
            assert.strictEqual(registry.has(createComponentId('ChildComponent', 'c2')), true);
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

            const parentId = createComponentId('TestComponent', 'test1');
            const childDecl = Object.assign(new ChildComponent(), { label: 'Hello' });
            childDecl[COMPONENT_ID] = createComponentId('ChildComponent', 'child1');

            await registry.create(parentId, TestComponent, { child: childDecl }, container);

            const childId = createComponentId('ChildComponent', 'child1');
            const childInstance = registry.get(childId);
            assert.strictEqual(childInstance.label, 'Hello');
            assert.ok(container.innerHTML.includes('Hello'));
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

            const parentId = createComponentId('TestComponent', 'test1');
            const childDecl = new ChildComponent();
            childDecl[COMPONENT_ID] = createComponentId('ChildComponent', 'child1');

            await registry.create(parentId, TestComponent, { child: childDecl }, container);

            const childId = createComponentId('ChildComponent', 'child1');
            const childContainer = registry.getContainer(childId);
            assert.ok(childContainer.classList.contains('ChildComponent'));
        });
    });

    describe('Orphan Handling', () => {
        it('detaches orphaned child containers before morphing', async () => {
            registry.registerComponent('ChildComponent', ChildComponent);
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1',
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>Child</span>',
                cssCode: '',
                version: 'v1',
            });

            const parentId = createComponentId('TestComponent', 'parent1');
            const childRef = new Child('ChildComponent', 'child1', {});

            const parent = await registry.create(parentId, TestComponent, { child: childRef }, container);
            const childId = createComponentId('ChildComponent', 'child1');

            // Intercept renderer to verify detach timing
            let childPresentDuringRender = true;
            const origRender = registry._renderer.render.bind(registry._renderer);
            registry._renderer.render = function (cont, compiled, vars, compId, constants) {
                childPresentDuringRender = !!cont.querySelector(
                    '[data-fusewire-id="ChildComponent#child1"]',
                );
                // Simple innerHTML render for JSDOM
                const html = compiled.render(vars, compId, constants || {});
                cont.innerHTML = html;
                return []; // mount points not needed for this test
            };

            // Remove and re-render
            parent.child = null;
            await registry.render(parentId);

            assert.strictEqual(childPresentDuringRender, false, 'child mount point should be detached before morphing');
            assert.strictEqual(registry.has(childId), false, 'child should be removed from registry after render');

            registry._renderer.render = origRender;
        });
    });
});
