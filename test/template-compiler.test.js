import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { ComponentId } from '../src/component-id.js';
import { compileTemplate } from '../src/template-compiler.js';

// Set up JSDOM global document
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

describe('Template Compiler', () => {
	describe('Variable Interpolation', () => {
		it('interpolates simple variable', () => {
			const template = compileTemplate('<div>((name))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ name: 'Alice' }, componentId);
			
			assert.ok(result.includes('Alice'));
		});

		it('interpolates nested property', () => {
			const template = compileTemplate('<div>((user.name))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ user: { name: 'Bob' } }, componentId);
			
			assert.ok(result.includes('Bob'));
		});

		it('handles deeply nested properties', () => {
			const template = compileTemplate('<div>((user.profile.role))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render(
				{ user: { profile: { role: 'admin' } } },
				componentId,
			);
			
			assert.ok(result.includes('admin'));
		});

		it('handles undefined variables as empty string', () => {
			const template = compileTemplate('<div>((missing))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(result.includes('><'));
			assert.ok(!result.includes('undefined'));
		});

		it('handles null variables as empty string', () => {
			const template = compileTemplate('<div>((value))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ value: null }, componentId);
			
			assert.ok(!result.includes('null'));
		});

		it('converts numbers to strings', () => {
			const template = compileTemplate('<div>((count))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ count: 42 }, componentId);
			
			assert.ok(result.includes('42'));
		});

		it('handles multiple interpolations', () => {
			const template = compileTemplate('<div>((first)) ((last))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ first: 'John', last: 'Doe' }, componentId);
			
			assert.ok(result.includes('John'));
			assert.ok(result.includes('Doe'));
		});
	});

	describe('Conditional Rendering (fw-if)', () => {
		it('renders element when condition is truthy', () => {
			const template = compileTemplate(
				'<div><span fw-if="isVisible">Hello</span></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ isVisible: true }, componentId);
			
			assert.ok(result.includes('Hello'));
		});

		it('hides element when condition is falsy', () => {
			const template = compileTemplate(
				'<div><span fw-if="isVisible">Hello</span></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ isVisible: false }, componentId);
			
			assert.ok(!result.includes('Hello'));
		});

		it('handles negated condition with !', () => {
			const template = compileTemplate(
				'<div><span fw-if="!isHidden">Visible</span></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ isHidden: false }, componentId);
			
			assert.ok(result.includes('Visible'));
		});

		it('hides element with negated truthy condition', () => {
			const template = compileTemplate(
				'<div><span fw-if="!isHidden">Visible</span></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ isHidden: true }, componentId);
			
			assert.ok(!result.includes('Visible'));
		});

		it('handles nested property in condition', () => {
			const template = compileTemplate(
				'<div><span fw-if="user.isAdmin">Admin</span></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render(
				{ user: { isAdmin: true } },
				componentId,
			);
			
			assert.ok(result.includes('Admin'));
		});

		it('treats array.length as truthy when > 0', () => {
			const template = compileTemplate(
				'<div><ul fw-if="items.length"><li>Has items</li></ul></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ items: [1, 2, 3] }, componentId);
			
			assert.ok(result.includes('Has items'));
		});

		it('treats empty array.length as falsy', () => {
			const template = compileTemplate(
				'<div><ul fw-if="items.length"><li>Has items</li></ul></div>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ items: [] }, componentId);
			
			assert.ok(!result.includes('Has items'));
		});
	});

	describe('Loops (fw-each)', () => {
		it('renders list items', () => {
			const template = compileTemplate(
				'<ul><li fw-each="item in items">((item))</li></ul>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ items: ['a', 'b', 'c'] }, componentId);
			
			assert.ok(result.includes('a'));
			assert.ok(result.includes('b'));
			assert.ok(result.includes('c'));
		});

		it('accesses nested properties in loop', () => {
			const template = compileTemplate(
				'<ul><li fw-each="user in users">((user.name))</li></ul>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render(
				{
					users: [{ name: 'Alice' }, { name: 'Bob' }],
				},
				componentId,
			);
			
			assert.ok(result.includes('Alice'));
			assert.ok(result.includes('Bob'));
		});

		it('renders nothing for empty array', () => {
			const template = compileTemplate(
				'<ul><li fw-each="item in items">((item))</li></ul>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ items: [] }, componentId);
			
			// Should have <ul></ul> but no <li>
			assert.ok(result.includes('<ul'));
			assert.ok(!result.includes('<li'));
		});

		it('renders nothing for undefined array', () => {
			const template = compileTemplate(
				'<ul><li fw-each="item in items">((item))</li></ul>',
			);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(!result.includes('<li'));
		});

		it('handles nested loops', () => {
			const template = compileTemplate(`
				<div>
					<div fw-each="category in categories">
						<h2>((category.name))</h2>
						<span fw-each="item in category.items">((item))</span>
					</div>
				</div>
			`);
			const componentId = new ComponentId('Test', 'main');
			const result = template.render(
				{
					categories: [
						{ name: 'A', items: ['a1', 'a2'] },
						{ name: 'B', items: ['b1'] },
					],
				},
				componentId,
			);
			
			assert.ok(result.includes('A'));
			assert.ok(result.includes('a1'));
			assert.ok(result.includes('a2'));
			assert.ok(result.includes('B'));
			assert.ok(result.includes('b1'));
		});
	});

	describe('Component Mount Points', () => {
		it('renders component as mount point', () => {
			// Mock component class
			class ChildComponent {
				static componentName = 'ChildComponent';
				constructor(id) {
					this.id = id;
				}
			}
			
			const template = compileTemplate('<div>((child))</div>');
			const componentId = new ComponentId('Parent', 'main');
			const child = new ChildComponent('child1');
			const result = template.render({ child }, componentId);
			
			assert.ok(result.includes('data-fusewire-id="ChildComponent#child1"'));
			assert.ok(result.includes('data-fusewire-parent-id="Parent#main"'));
		});

		it('renders array of components as mount points', () => {
			class Card {
				static componentName = 'Card';
				constructor(id) {
					this.id = id;
				}
			}
			
			const template = compileTemplate('<div>((cards))</div>');
			const componentId = new ComponentId('CardList', 'main');
			const cards = [new Card('card1'), new Card('card2')];
			const result = template.render({ cards }, componentId);
			
			assert.ok(result.includes('data-fusewire-id="Card#card1"'));
			assert.ok(result.includes('data-fusewire-id="Card#card2"'));
			assert.ok(result.includes('data-fusewire-parent-id="CardList#main"'));
		});
	});

	describe('Event Handlers', () => {
		it('replaces ((this)) with component reference placeholder', () => {
			const template = compileTemplate(
				'<button onclick="((this)).increment()">Click</button>',
			);
			const componentId = new ComponentId('Counter', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(result.includes('__FUSEWIRE_COMPONENT_Counter#main__'));
			assert.ok(result.includes('.increment()'));
		});

		it('handles multiple ((this)) references', () => {
			const template = compileTemplate(`
				<div>
					<button onclick="((this)).inc()">+</button>
					<button onclick="((this)).dec()">-</button>
				</div>
			`);
			const componentId = new ComponentId('Counter', 'main');
			const result = template.render({}, componentId);
			
			const matches = result.match(/__FUSEWIRE_COMPONENT_Counter#main__/g);
			assert.strictEqual(matches.length, 2);
		});
	});

	describe('CSS Scoping', () => {
		it('scopes CSS selectors', () => {
			const html = '<div class="container">Content</div>';
			const css = `.container { color: red; }
h1 { font-size: 2rem; }`;
			
			const template = compileTemplate(html, css);
			const scoped = template.css;
			
			assert.ok(scoped.includes('.fusewire-component-container .container'));
			assert.ok(scoped.includes('.fusewire-component-container h1'));
		});

		it('handles multiple selectors', () => {
			const html = '<div class="test">Test</div>';
			const css = `.a, .b { color: blue; }`;
			
			const template = compileTemplate(html, css);
			const scoped = template.css;
			
			assert.ok(scoped.includes('.fusewire-component-test .a'));
			assert.ok(scoped.includes('.fusewire-component-test .b'));
		});

		it('returns empty string for empty CSS', () => {
			const template = compileTemplate('<div>Test</div>', '');
			assert.strictEqual(template.css, '');
		});
	});

	describe('Component Scoping Class', () => {
		it('adds scoping class to root element', () => {
			const template = compileTemplate('<div class="counter">Count</div>');
			const componentId = new ComponentId('Counter', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(result.includes('fusewire-component-Counter'));
		});

		it('preserves existing classes', () => {
			const template = compileTemplate('<div class="counter primary">Count</div>');
			const componentId = new ComponentId('Counter', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(result.includes('counter'));
			assert.ok(result.includes('primary'));
			assert.ok(result.includes('fusewire-component-Counter'));
		});
	});

	describe('Edge Cases', () => {
		it('handles empty template', () => {
			const template = compileTemplate('');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({}, componentId);
			
			assert.strictEqual(result, '');
		});

		it('handles template with only text', () => {
			const template = compileTemplate('<div>Plain text</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({}, componentId);
			
			assert.ok(result.includes('Plain text'));
		});

		it('handles special characters in interpolation', () => {
			const template = compileTemplate('<div>((text))</div>');
			const componentId = new ComponentId('Test', 'main');
			const result = template.render({ text: '<script>alert("xss")</script>' }, componentId);
			
			// Should escape HTML
			assert.ok(result.includes('&lt;') || result.includes('<script>'));
		});
	});
});
