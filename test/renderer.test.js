import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { Renderer } from '../src/renderer.js';
import { ComponentId } from '../src/component-id.js';
import { Idiomorph } from 'idiomorph';

describe('Renderer', () => {
    let dom;
    let document;
    let container;
    const appName = 'testApp';

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost', // Needed for localStorage
        });
        document = dom.window.document;
        const { window } = dom;

        // Set up global DOM objects for idiomorph
        // Copy all relevant constructors from JSDOM window to global
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

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    describe('Constructor', () => {
        it('creates renderer with morph function and appName', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            assert.ok(renderer);
            assert.strictEqual(typeof renderer.morphFunction, 'function');
            assert.strictEqual(renderer._appName, appName);
        });

        it('defaults appName to "default"', () => {
            const renderer = new Renderer(Idiomorph.morph);
            assert.strictEqual(renderer._appName, 'default');
        });
    });

    describe('render()', () => {
        it('renders template on first render (innerHTML)', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: (vars) => `<div class="counter">${vars.count}</div>`,
                css: '.counter { color: red; }',
            };
            const componentId = new ComponentId('Counter', '1');

            const mountPoints = renderer.render(
                container,
                compiledTemplate,
                { count: 5 },
                componentId,
            );

            assert.strictEqual(container.innerHTML, '<div class="counter">5</div>');
            assert.strictEqual(mountPoints.length, 0);
        });

        // Note: Morphing tests are skipped in Node/JSDOM due to idiomorph compatibility issues
        // These tests pass in real browsers - see test/browser/morphing.spec.js
        it.skip('morphs DOM on re-render', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: (vars) => `<div class="counter">${vars.count}</div>`,
                css: '',
            };
            const componentId = new ComponentId('Counter', '1');

            // First render
            renderer.render(container, compiledTemplate, { count: 5 }, componentId);
            const firstDiv = container.querySelector('.counter');

            // Second render with updated count
            renderer.render(container, compiledTemplate, { count: 10 }, componentId);
            const secondDiv = container.querySelector('.counter');

            // Same element reference (morphed, not replaced)
            assert.strictEqual(firstDiv, secondDiv);
            assert.strictEqual(secondDiv.textContent, '10');
        });

        it('injects scoped CSS on first render', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: () => '<div>Test</div>',
                css: '.test { color: blue; }',
            };
            const componentId = new ComponentId('TestComponent', '1');

            renderer.render(container, compiledTemplate, {}, componentId);

            const styleEl = document.getElementById(
                `fusewire-style-${appName}-TestComponent`,
            );
            assert.ok(styleEl);
            // CSS should be scoped with appName + component class
            assert.ok(styleEl.textContent.includes(`.${appName}`));
            assert.ok(styleEl.textContent.includes('.TestComponent'));
            assert.ok(styleEl.textContent.includes('.test'));
        });

        it('injects CSS only once per component name', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: () => '<div>Test</div>',
                css: '.test { color: blue; }',
            };

            // Render first instance
            renderer.render(
                container,
                compiledTemplate,
                {},
                new ComponentId('TestComponent', '1'),
            );

            // Render second instance
            const container2 = document.createElement('div');
            renderer.render(
                container2,
                compiledTemplate,
                {},
                new ComponentId('TestComponent', '2'),
            );

            // Only one style tag should exist
            const styleTags = document.querySelectorAll(
                `[id^="fusewire-style-${appName}-TestComponent"]`,
            );
            assert.strictEqual(styleTags.length, 1);
        });

        it('does not inject CSS if cssCode is empty', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: () => '<div>Test</div>',
                css: '',
            };
            const componentId = new ComponentId('NoCSS', '1');

            renderer.render(container, compiledTemplate, {}, componentId);

            const styleEl = document.getElementById(`fusewire-style-${appName}-NoCSS`);
            assert.strictEqual(styleEl, null);
        });

        it('finds child mount points', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: (vars, parentId) =>
                    `<div>
                        <div data-fusewire-id="Child#1" data-fusewire-parent-id="${parentId}"></div>
                        <div data-fusewire-id="Child#2" data-fusewire-parent-id="${parentId}"></div>
                    </div>`,
                css: '',
            };
            const componentId = new ComponentId('Parent', '1');

            const mountPoints = renderer.render(
                container,
                compiledTemplate,
                {},
                componentId,
            );

            assert.strictEqual(mountPoints.length, 2);
            assert.strictEqual(
                mountPoints[0].getAttribute('data-fusewire-id'),
                'Child#1',
            );
            assert.strictEqual(
                mountPoints[1].getAttribute('data-fusewire-id'),
                'Child#2',
            );
        });

        it.skip('updates text nodes via morphing', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: (vars) => `<div><span>${vars.text}</span></div>`,
                css: '',
            };
            const componentId = new ComponentId('Text', '1');

            renderer.render(container, compiledTemplate, { text: 'Hello' }, componentId);
            const span = container.querySelector('span');
            assert.strictEqual(span.textContent, 'Hello');

            renderer.render(container, compiledTemplate, { text: 'World' }, componentId);
            assert.strictEqual(span.textContent, 'World');
        });

        it.skip('updates attributes via morphing', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const compiledTemplate = {
                render: (vars) => `<div><button class="${vars.btnClass}">Click</button></div>`,
                css: '',
            };
            const componentId = new ComponentId('Button', '1');

            renderer.render(
                container,
                compiledTemplate,
                { btnClass: 'primary' },
                componentId,
            );
            const button = container.querySelector('button');
            assert.strictEqual(button.className, 'primary');

            renderer.render(
                container,
                compiledTemplate,
                { btnClass: 'secondary' },
                componentId,
            );
            assert.strictEqual(button.className, 'secondary');
        });
    });

    describe('_scopeCSS()', () => {
        it('wraps CSS in nested appName and component class rules', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const scoped = renderer._scopeCSS('.test { color: red; }', 'Counter');

            assert.ok(scoped.startsWith(`.${appName} {`));
            assert.ok(scoped.includes('.Counter {'));
            assert.ok(scoped.includes('.test { color: red; }'));
        });

        it('preserves raw CSS inside the nesting', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const css = `.a, .b { color: blue; }
.c { font-size: 1rem; }`;
            const scoped = renderer._scopeCSS(css, 'Counter');

            assert.ok(scoped.includes('.a, .b { color: blue; }'));
            assert.ok(scoped.includes('.c { font-size: 1rem; }'));
        });

        it('returns empty string for empty CSS', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            assert.strictEqual(renderer._scopeCSS('', 'Counter'), '');
            assert.strictEqual(renderer._scopeCSS('   ', 'Counter'), '');
        });
    });

    describe('Morph exclusion', () => {
        it('passes beforeNodeMorphed callback to morph function on re-render', () => {
            let capturedOptions;
            const mockMorph = (target, html, options) => {
                capturedOptions = options;
                // Simulate morph by setting innerHTML (simplified)
                target.innerHTML = html;
            };
            const renderer = new Renderer(mockMorph, appName);
            const compiledTemplate = {
                render: () => '<div>Content</div>',
                css: '',
            };
            const componentId = new ComponentId('Test', '1');

            // First render (uses innerHTML, no morph)
            renderer.render(container, compiledTemplate, {}, componentId);
            assert.strictEqual(capturedOptions, undefined);

            // Second render (uses morph)
            renderer.render(container, compiledTemplate, {}, componentId);
            assert.ok(capturedOptions);
            assert.ok(capturedOptions.callbacks);
            assert.strictEqual(typeof capturedOptions.callbacks.beforeNodeMorphed, 'function');
        });

        it('beforeNodeMorphed returns false for data-fusewire-id elements', () => {
            let capturedCallback;
            const mockMorph = (target, html, options) => {
                capturedCallback = options.callbacks.beforeNodeMorphed;
                target.innerHTML = html;
            };
            const renderer = new Renderer(mockMorph, appName);
            const compiledTemplate = {
                render: () => '<div>Content</div>',
                css: '',
            };
            const componentId = new ComponentId('Test', '1');

            // First render, then re-render to capture callback
            renderer.render(container, compiledTemplate, {}, componentId);
            renderer.render(container, compiledTemplate, {}, componentId);

            // Test: element with data-fusewire-id should be skipped
            const mountPoint = document.createElement('div');
            mountPoint.setAttribute('data-fusewire-id', 'Child#1');
            assert.strictEqual(capturedCallback(mountPoint), false);

            // Test: regular element should not be skipped
            const regularDiv = document.createElement('div');
            assert.notStrictEqual(capturedCallback(regularDiv), false);
        });

        it('beforeNodeMorphed returns false for data-fusewire-each elements', () => {
            let capturedCallback;
            const mockMorph = (target, html, options) => {
                capturedCallback = options.callbacks.beforeNodeMorphed;
                target.innerHTML = html;
            };
            const renderer = new Renderer(mockMorph, appName);
            const compiledTemplate = {
                render: () => '<div>Content</div>',
                css: '',
            };
            const componentId = new ComponentId('Test', '1');

            renderer.render(container, compiledTemplate, {}, componentId);
            renderer.render(container, compiledTemplate, {}, componentId);

            // Test: element with data-fusewire-each should be skipped
            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            assert.strictEqual(capturedCallback(eachContainer), false);
        });

        it('beforeNodeMorphed ignores non-element nodes', () => {
            let capturedCallback;
            const mockMorph = (target, html, options) => {
                capturedCallback = options.callbacks.beforeNodeMorphed;
                target.innerHTML = html;
            };
            const renderer = new Renderer(mockMorph, appName);
            const compiledTemplate = {
                render: () => '<div>Content</div>',
                css: '',
            };
            const componentId = new ComponentId('Test', '1');

            renderer.render(container, compiledTemplate, {}, componentId);
            renderer.render(container, compiledTemplate, {}, componentId);

            // Text nodes (nodeType 3) should not be skipped
            const textNode = document.createTextNode('hello');
            assert.notStrictEqual(capturedCallback(textNode), false);
        });
    });

    describe('_extractContainerState()', () => {
        it('extracts mount point IDs from reconciliation containers', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const html = `<div data-fusewire-each="logs">
                <div data-fusewire-id="LogLine#0" data-fusewire-parent-id="Console#main"></div>
                <div data-fusewire-id="LogLine#1" data-fusewire-parent-id="Console#main"></div>
            </div>`;

            const state = renderer._extractContainerState(html);

            assert.strictEqual(state.size, 1);
            const logs = state.get('logs');
            assert.strictEqual(logs.length, 2);
            assert.strictEqual(logs[0].id, 'LogLine#0');
            assert.strictEqual(logs[0].parentId, 'Console#main');
            assert.strictEqual(logs[1].id, 'LogLine#1');
            assert.strictEqual(logs[1].parentId, 'Console#main');
        });

        it('returns empty map when no containers exist', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const html = '<div>No containers</div>';

            const state = renderer._extractContainerState(html);
            assert.strictEqual(state.size, 0);
        });

        it('handles empty reconciliation container', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const html = '<div data-fusewire-each="items"></div>';

            const state = renderer._extractContainerState(html);
            assert.strictEqual(state.size, 1);
            assert.strictEqual(state.get('items').length, 0);
        });

        it('handles multiple reconciliation containers', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const html = `
                <div data-fusewire-each="items">
                    <div data-fusewire-id="Item#1" data-fusewire-parent-id="P#m"></div>
                </div>
                <div data-fusewire-each="widgets">
                    <div data-fusewire-id="Widget#a" data-fusewire-parent-id="P#m"></div>
                    <div data-fusewire-id="Widget#b" data-fusewire-parent-id="P#m"></div>
                </div>`;

            const state = renderer._extractContainerState(html);
            assert.strictEqual(state.size, 2);
            assert.strictEqual(state.get('items').length, 1);
            assert.strictEqual(state.get('widgets').length, 2);
        });
    });

    describe('_reconcileContainers()', () => {
        it('appends new mount points', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);

            // Set up DOM with one existing mount point
            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            const existing = document.createElement('div');
            existing.setAttribute('data-fusewire-id', 'Item#0');
            existing.setAttribute('data-fusewire-parent-id', 'List#main');
            existing.textContent = 'rendered content';
            eachContainer.appendChild(existing);
            container.appendChild(eachContainer);

            // Expected: two mount points (one existing, one new)
            const expected = new Map([
                ['items', [
                    { id: 'Item#0', parentId: 'List#main' },
                    { id: 'Item#1', parentId: 'List#main' },
                ]],
            ]);

            renderer._reconcileContainers(container, expected);

            assert.strictEqual(eachContainer.children.length, 2);
            assert.strictEqual(eachContainer.children[0].getAttribute('data-fusewire-id'), 'Item#0');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-id'), 'Item#1');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-parent-id'), 'List#main');
            // Existing element content preserved
            assert.strictEqual(eachContainer.children[0].textContent, 'rendered content');
        });

        it('removes stale mount points', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);

            // Set up DOM with three mount points
            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            for (const id of ['Item#0', 'Item#1', 'Item#2']) {
                const mp = document.createElement('div');
                mp.setAttribute('data-fusewire-id', id);
                eachContainer.appendChild(mp);
            }
            container.appendChild(eachContainer);

            // Expected: only first and third remain
            const expected = new Map([
                ['items', [
                    { id: 'Item#0', parentId: 'List#main' },
                    { id: 'Item#2', parentId: 'List#main' },
                ]],
            ]);

            renderer._reconcileContainers(container, expected);

            assert.strictEqual(eachContainer.children.length, 2);
            assert.strictEqual(eachContainer.children[0].getAttribute('data-fusewire-id'), 'Item#0');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-id'), 'Item#2');
        });

        it('preserves existing mount point content', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);

            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            const mp = document.createElement('div');
            mp.setAttribute('data-fusewire-id', 'Item#0');
            mp.innerHTML = '<span>Child content</span>';
            eachContainer.appendChild(mp);
            container.appendChild(eachContainer);

            const expected = new Map([
                ['items', [{ id: 'Item#0', parentId: 'List#main' }]],
            ]);

            renderer._reconcileContainers(container, expected);

            // Content inside mount point should be untouched
            assert.strictEqual(eachContainer.children[0].innerHTML, '<span>Child content</span>');
        });

        it('handles reconciliation with no changes', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);

            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            for (const id of ['Item#0', 'Item#1']) {
                const mp = document.createElement('div');
                mp.setAttribute('data-fusewire-id', id);
                eachContainer.appendChild(mp);
            }
            container.appendChild(eachContainer);

            const expected = new Map([
                ['items', [
                    { id: 'Item#0', parentId: '' },
                    { id: 'Item#1', parentId: '' },
                ]],
            ]);

            renderer._reconcileContainers(container, expected);

            assert.strictEqual(eachContainer.children.length, 2);
            assert.strictEqual(eachContainer.children[0].getAttribute('data-fusewire-id'), 'Item#0');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-id'), 'Item#1');
        });

        it('removes all mount points when expected is empty', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);

            const eachContainer = document.createElement('div');
            eachContainer.setAttribute('data-fusewire-each', 'items');
            const mp = document.createElement('div');
            mp.setAttribute('data-fusewire-id', 'Item#0');
            eachContainer.appendChild(mp);
            container.appendChild(eachContainer);

            const expected = new Map([['items', []]]);

            renderer._reconcileContainers(container, expected);

            assert.strictEqual(eachContainer.children.length, 0);
        });
    });

    describe('render() with reconciliation containers', () => {
        it('finds mount points inside reconciliation containers on first render', () => {
            const renderer = new Renderer(Idiomorph.morph, appName);
            const parentId = new ComponentId('Console', 'main');
            const compiledTemplate = {
                render: (vars, compId) =>
                    `<div class="console-logs"><div data-fusewire-each="logs">` +
                    `<div data-fusewire-id="LogLine#0" data-fusewire-parent-id="${compId}"></div>` +
                    `<div data-fusewire-id="LogLine#1" data-fusewire-parent-id="${compId}"></div>` +
                    `</div></div>`,
                css: '',
            };

            const mountPoints = renderer.render(
                container,
                compiledTemplate,
                {},
                parentId,
            );

            assert.strictEqual(mountPoints.length, 2);
            assert.strictEqual(mountPoints[0].getAttribute('data-fusewire-id'), 'LogLine#0');
            assert.strictEqual(mountPoints[1].getAttribute('data-fusewire-id'), 'LogLine#1');
        });

        it('reconciles mount points on re-render via mock morph', () => {
            // Use a mock morph that preserves the old DOM (simulates skipping)
            const mockMorph = (target, html, options) => {
                // Simulate idiomorph behavior: for each-containers, beforeNodeMorphed
                // returns false, so the container is preserved as-is.
                // For simplicity, we just leave the DOM unchanged (morph is a no-op).
            };
            const renderer = new Renderer(mockMorph, appName);
            const parentId = new ComponentId('Console', 'main');

            // First render: one log line
            const template1 = {
                render: (vars, compId) =>
                    `<div data-fusewire-each="logs">` +
                    `<div data-fusewire-id="LogLine#0" data-fusewire-parent-id="${compId}"></div>` +
                    `</div>`,
                css: '',
            };
            renderer.render(container, template1, {}, parentId);
            assert.strictEqual(
                container.querySelector('[data-fusewire-each]').children.length,
                1,
            );

            // Re-render: two log lines (morph is no-op, reconciliation handles it)
            const template2 = {
                render: (vars, compId) =>
                    `<div data-fusewire-each="logs">` +
                    `<div data-fusewire-id="LogLine#0" data-fusewire-parent-id="${compId}"></div>` +
                    `<div data-fusewire-id="LogLine#1" data-fusewire-parent-id="${compId}"></div>` +
                    `</div>`,
                css: '',
            };
            renderer.render(container, template2, {}, parentId);

            const eachContainer = container.querySelector('[data-fusewire-each]');
            assert.strictEqual(eachContainer.children.length, 2);
            assert.strictEqual(eachContainer.children[0].getAttribute('data-fusewire-id'), 'LogLine#0');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-id'), 'LogLine#1');
        });
    });
});
