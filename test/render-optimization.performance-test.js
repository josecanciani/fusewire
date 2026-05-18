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
import { Persistence } from '../src/persistence.js';
import { COMPONENT_ID } from '../src/symbols.js';
import { StateSerializer } from '../src/state-serializer.js';

describe('Render Optimizations', () => {
    let dom;
    let document;
    let registry;
    let renderer;
    let templateStore;
    let container;

    class ChildComponent extends Component { }

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost',
        });
        document = dom.window.document;
        const { window } = dom;

        Object.keys(window).forEach((key) => {
            const value = window[key];
            if (
                typeof value === 'function' &&
                (key.startsWith('HTML') ||
                    key.startsWith('DOM') ||
                    key === 'Node' ||
                    key === 'Element' ||
                    key === 'Document')
            ) {
                global[key] = value;
            }
        });
        global.document = document;
        global.localStorage = window.localStorage;

        templateStore = new TemplateStore();

        renderer = new Renderer((cont, html, options) => {
            return Idiomorph.morph(cont, html, options);
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

        // ChildComponent is used across most tests — register so componentName is set
        registry.registerComponent('ChildComponent', ChildComponent);

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    describe('Child declaration lookup (O(1) via declarations Map)', () => {
        it('returns declarations Map alongside children Map for Component vars', () => {
            const instance = new Component();
            const child = new ChildComponent();
            child[COMPONENT_ID] = createComponentId('ChildComponent', 'c1');
            instance.child = child;

            const result = registry._collectChildComponents(instance);

            assert.strictEqual(result.children.size, 1);
            assert.strictEqual(result.declarations.size, 1);
            assert.ok(result.children.has('ChildComponent#c1'));
            assert.strictEqual(result.declarations.get('ChildComponent#c1'), child);
        });

        it('returns declarations Map for Child vars', () => {
            const instance = new Component();
            const ref = new Child('ChildComponent', 'c1', {});
            instance.child = ref;

            const result = registry._collectChildComponents(instance);

            assert.strictEqual(result.children.size, 1);
            assert.strictEqual(result.declarations.size, 1);
            assert.strictEqual(result.declarations.get('ChildComponent#c1'), ref);
        });

        it('indexes array of child declarations', () => {
            const instance = new Component();
            const children = [];
            for (let i = 0; i < 5; i++) {
                const child = new ChildComponent();
                child[COMPONENT_ID] = createComponentId('ChildComponent', `c${i}`);
                children.push(child);
            }
            instance.cells = children;

            const result = registry._collectChildComponents(instance);

            assert.strictEqual(result.declarations.size, 5);
            for (let i = 0; i < 5; i++) {
                const code = `ChildComponent#c${i}`;
                assert.strictEqual(result.declarations.get(code), children[i]);
            }
        });

        it('produces correct map for hundreds of children', () => {
            const instance = new Component();
            const count = 500;
            const childInstances = [];
            for (let i = 0; i < count; i++) {
                const child = new ChildComponent();
                child[COMPONENT_ID] = createComponentId('ChildComponent', `c${i}`);
                childInstances.push(child);
            }
            instance.cells = childInstances;

            const result = registry._collectChildComponents(instance);

            assert.strictEqual(result.declarations.size, count);
            // Verify random-access lookup works (O(1) via Map.get)
            assert.strictEqual(
                result.declarations.get('ChildComponent#c0'),
                childInstances[0],
            );
            assert.strictEqual(
                result.declarations.get(`ChildComponent#c${count - 1}`),
                childInstances[count - 1],
            );
            assert.strictEqual(
                result.declarations.get(`ChildComponent#c${Math.floor(count / 2)}`),
                childInstances[Math.floor(count / 2)],
            );
        });
    });

    describe('Skip child re-render when mount point is preserved', () => {
        it('does not re-render child when _mountChild receives the same container element', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1',
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>child content</span>',
                cssCode: '',
                version: 'v1',
            });

            const parentId = createComponentId('TestComponent', 'p1', 'v1');
            const childDecl = new ChildComponent();
            childDecl[COMPONENT_ID] = createComponentId('ChildComponent', 'child1');

            await registry.create(parentId, Component, { child: childDecl }, container);

            // Verify child was created
            const childId = createComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);

            // Get the child's current container — this is the mount point element
            const childEntry = registry._instances.get(childId.code);
            const mountPoint = childEntry.container;

            // Set up render spy
            let childRendered = false;
            const originalRender = registry.render;
            registry.render = async function (id) {
                if (id.code === childId.code) {
                    childRendered = true;
                }
                return originalRender.call(this, id);
            };

            // Call _mountChild with the SAME mount point element
            const parentInstance = registry._instances.get(parentId.code).instance;
            const { declarations } = registry._collectChildComponents(parentInstance);
            await registry._mountChild(mountPoint, parentInstance, declarations);

            assert.strictEqual(
                childRendered,
                false,
                'Child should not be re-rendered when mount point is the same DOM element',
            );
        });

        it('teleports DOM and skips re-render when _mountChild receives a different container element', async () => {
            templateStore.set('TestComponent', {
                htmlCode: '<div>((child))</div>',
                cssCode: '',
                version: 'v1',
            });
            templateStore.set('ChildComponent', {
                htmlCode: '<span>child content</span>',
                cssCode: '',
                version: 'v1',
            });

            const parentId = createComponentId('TestComponent', 'p1', 'v1');
            const childDecl = new ChildComponent();
            childDecl[COMPONENT_ID] = createComponentId('ChildComponent', 'child1');

            await registry.create(parentId, Component, { child: childDecl }, container);

            const childId = createComponentId('ChildComponent', 'child1');
            assert.strictEqual(registry.has(childId), true);

            // Create a DIFFERENT mount point element (simulates morph replacing the element)
            const newMountPoint = document.createElement('fw-mount');
            newMountPoint.setAttribute('data-fusewire-id', childId.code);
            container.querySelector('div').appendChild(newMountPoint);

            // Set up render spy
            let childRendered = false;
            const originalRender = registry.render;
            registry.render = async function (id) {
                if (id.code === childId.code) {
                    childRendered = true;
                }
                return originalRender.call(this, id);
            };

            // Call _mountChild with a DIFFERENT mount point element
            const parentInstance = registry._instances.get(parentId.code).instance;
            const { declarations } = registry._collectChildComponents(parentInstance);
            await registry._mountChild(newMountPoint, parentInstance, declarations);

            assert.strictEqual(
                childRendered,
                false,
                'Child should not be re-rendered because DOM teleportation preserves the old DOM',
            );
            assert.ok(newMountPoint.innerHTML.includes('child content'), 'DOM should have been teleported');
        });

        it('skips re-render for all children when parent re-renders with stable vars', async () => {
            // Idiomorph's morph() doesn't work in JSDOM (Document constructor mismatch),
            // so we use a no-op morph that simulates what real morph does: preserve existing
            // mount point elements (via beforeNodeMorphed returning false for data-fusewire-id).
            // The reconciliation logic then reuses the same DOM elements, ensuring
            // entry.container === mountPoint and triggering the skip.
            renderer.morphFunction = () => { };

            const childCount = 20;

            class Parent extends Component {
                /** @type {Array.<Component>} */
                cells = [];
                async init() {
                    for (let i = 0; i < childCount; i++) {
                        this.cells.push(this.createChild('Cell', `c${i}`, {}));
                    }
                }
            }
            class Cell extends Component { }

            registry.registerComponent('Parent', Parent);
            registry.registerComponent('Cell', Cell);
            templateStore.set('Parent', {
                htmlCode: '<div fw-each="cell in cells">((cell))</div>',
                cssCode: '',
                version: 'v1',
            });
            templateStore.set('Cell', {
                htmlCode: '<span>cell</span>',
                cssCode: '',
                version: 'v1',
            });

            const parentId = createComponentId('Parent', 'root', 'v1');
            await registry.create(parentId, Parent, {}, container);

            // Verify all children were created
            for (let i = 0; i < childCount; i++) {
                assert.strictEqual(
                    registry.has(createComponentId('Cell', `c${i}`)),
                    true,
                    `Cell#c${i} should exist`,
                );
            }

            // Set up render spy — count child re-renders during parent re-render
            const childRenders = [];
            const originalRender = registry.render;
            registry.render = async function (id) {
                if (id.name === 'Cell') {
                    childRenders.push(id.code);
                }
                return originalRender.call(this, id);
            };

            // Re-render parent (vars unchanged, so mount points should be preserved)
            await registry.render(parentId);

            assert.strictEqual(
                childRenders.length,
                0,
                `Expected 0 child re-renders but got ${childRenders.length}: ${childRenders.join(', ')}`,
            );
        });
    });
});
