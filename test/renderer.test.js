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
		it('creates renderer with morph function', () => {
			const renderer = new Renderer(Idiomorph.morph);
			assert.ok(renderer);
			assert.strictEqual(typeof renderer.morphFunction, 'function');
		});
	});

	describe('render()', () => {
		it('renders template on first render (innerHTML)', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: (vars) => `<div class="counter">${vars.count}</div>`,
				cssCode: '.counter { color: red; }',
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

		it('morphs DOM on re-render', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: (vars) => `<div class="counter">${vars.count}</div>`,
				cssCode: '',
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

		it('injects CSS on first render', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: () => '<div>Test</div>',
				cssCode: '.test { color: blue; }',
			};
			const componentId = new ComponentId('TestComponent', '1');

			renderer.render(container, compiledTemplate, {}, componentId);

			const styleEl = document.getElementById(
				'fusewire-style-TestComponent',
			);
			assert.ok(styleEl);
			assert.strictEqual(styleEl.textContent, '.test { color: blue; }');
		});

		it('injects CSS only once per component name', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: () => '<div>Test</div>',
				cssCode: '.test { color: blue; }',
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
				'[id^="fusewire-style-TestComponent"]',
			);
			assert.strictEqual(styleTags.length, 1);
		});

		it('does not inject CSS if cssCode is empty', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: () => '<div>Test</div>',
				cssCode: '',
			};
			const componentId = new ComponentId('NoCSS', '1');

			renderer.render(container, compiledTemplate, {}, componentId);

			const styleEl = document.getElementById('fusewire-style-NoCSS');
			assert.strictEqual(styleEl, null);
		});

		it('finds child mount points', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: (vars, parentId) =>
					`<div>
						<div data-fusewire-id="Child#1" data-fusewire-parent-id="${parentId}"></div>
						<div data-fusewire-id="Child#2" data-fusewire-parent-id="${parentId}"></div>
					</div>`,
				cssCode: '',
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

		it('updates text nodes via morphing', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: (vars) => `<div><span>${vars.text}</span></div>`,
				cssCode: '',
			};
			const componentId = new ComponentId('Text', '1');

			renderer.render(container, compiledTemplate, { text: 'Hello' }, componentId);
			const span = container.querySelector('span');
			assert.strictEqual(span.textContent, 'Hello');

			renderer.render(container, compiledTemplate, { text: 'World' }, componentId);
			assert.strictEqual(span.textContent, 'World');
		});

		it('updates attributes via morphing', () => {
			const renderer = new Renderer(Idiomorph.morph);
			const compiledTemplate = {
				render: (vars) => `<div><button class="${vars.btnClass}">Click</button></div>`,
				cssCode: '',
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
});
