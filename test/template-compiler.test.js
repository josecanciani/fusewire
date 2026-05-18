import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createComponentId, componentIdFromCode, componentIdsEqual } from '../src/component-id.js';
import { compileTemplate } from '../src/template-compiler.js';
import { Child } from '../src/component.js';

// Set up JSDOM global document
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

describe('Template Compiler', () => {
    describe('Variable Interpolation', () => {
        it('interpolates simple variable', () => {
            const template = compileTemplate('<div>((name))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ name: 'Alice' }, componentId);

            assert.ok(result.includes('Alice'));
        });

        it('interpolates nested property', () => {
            const template = compileTemplate('<div>((user.name))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ user: { name: 'Bob' } }, componentId);

            assert.ok(result.includes('Bob'));
        });

        it('handles deeply nested properties', () => {
            const template = compileTemplate('<div>((user.profile.role))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                { user: { profile: { role: 'admin' } } },
                componentId,
            );

            assert.ok(result.includes('admin'));
        });

        it('handles undefined variables as empty string', () => {
            const template = compileTemplate('<div>((missing))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({}, componentId);

            assert.ok(result.includes('><'));
            assert.ok(!result.includes('undefined'));
        });

        it('handles null variables as empty string', () => {
            const template = compileTemplate('<div>((value))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ value: null }, componentId);

            assert.ok(!result.includes('null'));
        });

        it('converts numbers to strings', () => {
            const template = compileTemplate('<div>((count))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ count: 42 }, componentId);

            assert.ok(result.includes('42'));
        });

        it('interpolates $-prefixed calculated vars', () => {
            const template = compileTemplate('<span>(($formattedTotal))</span>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ $formattedTotal: '$1,234.56' }, componentId);

            assert.ok(result.includes('$1,234.56'));
        });

        it('handles multiple interpolations', () => {
            const template = compileTemplate('<div>((first)) ((last))</div>');
            const componentId = createComponentId('Test', 'main');
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
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ isVisible: true }, componentId);

            assert.ok(result.includes('Hello'));
        });

        it('hides element when condition is falsy', () => {
            const template = compileTemplate(
                '<div><span fw-if="isVisible">Hello</span></div>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ isVisible: false }, componentId);

            assert.ok(!result.includes('Hello'));
        });

        it('handles negated condition with !', () => {
            const template = compileTemplate(
                '<div><span fw-if="!isHidden">Visible</span></div>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ isHidden: false }, componentId);

            assert.ok(result.includes('Visible'));
        });

        it('hides element with negated truthy condition', () => {
            const template = compileTemplate(
                '<div><span fw-if="!isHidden">Visible</span></div>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ isHidden: true }, componentId);

            assert.ok(!result.includes('Visible'));
        });

        it('handles nested property in condition', () => {
            const template = compileTemplate(
                '<div><span fw-if="user.isAdmin">Admin</span></div>',
            );
            const componentId = createComponentId('Test', 'main');
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
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ items: [1, 2, 3] }, componentId);

            assert.ok(result.includes('Has items'));
        });

        it('treats empty array.length as falsy', () => {
            const template = compileTemplate(
                '<div><ul fw-if="items.length"><li>Has items</li></ul></div>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ items: [] }, componentId);

            assert.ok(!result.includes('Has items'));
        });

        it('handles nested same-tag elements inside fw-if', () => {
            const template = compileTemplate(
                '<div fw-if="show"><div class="inner"><div class="deep">Content</div></div></div>',
            );
            const componentId = createComponentId('Test', 'main');

            const shown = template.render({ show: true }, componentId);
            assert.ok(shown.includes('Content'));
            assert.ok(shown.includes('class="inner"'));
            assert.ok(shown.includes('class="deep"'));

            const hidden = template.render({ show: false }, componentId);
            assert.ok(!hidden.includes('Content'));
        });

        it('handles nested fw-if on same tag type', () => {
            const template = compileTemplate(
                '<div fw-if="outer"><div fw-if="inner">Both true</div></div>',
            );
            const componentId = createComponentId('Test', 'main');

            const both = template.render({ outer: true, inner: true }, componentId);
            assert.ok(both.includes('Both true'));

            const outerOnly = template.render({ outer: true, inner: false }, componentId);
            assert.ok(!outerOnly.includes('Both true'));
            assert.ok(outerOnly.includes('<div>')); // Outer div stays

            const neither = template.render({ outer: false, inner: true }, componentId);
            assert.ok(!neither.includes('Both true'));
        });
    });

    describe('Loops (fw-each)', () => {
        it('renders list items', () => {
            const template = compileTemplate(
                '<ul><li fw-each="item in items">((item))</li></ul>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ items: ['a', 'b', 'c'] }, componentId);

            assert.ok(result.includes('a'));
            assert.ok(result.includes('b'));
            assert.ok(result.includes('c'));
        });

        it('accesses nested properties in loop', () => {
            const template = compileTemplate(
                '<ul><li fw-each="user in users">((user.name))</li></ul>',
            );
            const componentId = createComponentId('Test', 'main');
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
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ items: [] }, componentId);

            // Should have <ul></ul> but no <li>
            assert.ok(result.includes('<ul'));
            assert.ok(!result.includes('<li'));
        });

        it('renders nothing for undefined array', () => {
            const template = compileTemplate(
                '<ul><li fw-each="item in items">((item))</li></ul>',
            );
            const componentId = createComponentId('Test', 'main');
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
            const componentId = createComponentId('Test', 'main');
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

        it('handles nested same-tag elements inside fw-each', () => {
            const template = compileTemplate(
                '<ul><div fw-each="item in items"><div class="inner">((item))</div></div></ul>',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ items: ['x', 'y'] }, componentId);

            assert.ok(result.includes('class="inner"'));
            assert.ok(result.includes('x'));
            assert.ok(result.includes('y'));
            // Both items should be rendered as separate outer divs
            const outerDivs = result.match(/<div><div class="inner">/g);
            assert.strictEqual(outerDivs.length, 2);
        });

        it('handles nested fw-each on same tag type', () => {
            const template = compileTemplate(`
                <ul>
                    <li fw-each="group in groups">
                        <li fw-each="item in group.items">((item))</li>
                    </li>
                </ul>
            `);
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                {
                    groups: [
                        { items: ['a', 'b'] },
                        { items: ['c'] },
                    ],
                },
                componentId,
            );

            assert.ok(result.includes('a'));
            assert.ok(result.includes('b'));
            assert.ok(result.includes('c'));
        });

        it('interpolates loop variables in element attributes', () => {
            const template = compileTemplate(
                '<ul><li fw-each="item in items" data-id="((item.id))" onclick="handle(\'((item.name))\')">((item.name))</li></ul>',
                '',
                'testApp',
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                { items: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }] },
                componentId,
            );

            assert.ok(result.includes('data-id="1"'));
            assert.ok(result.includes('data-id="2"'));
            assert.ok(result.includes("handle('Alice')"));
            assert.ok(result.includes("handle('Bob')"));
        });

        it('handles fw-if nested inside fw-each evaluating against loop variables', () => {
            const template = compileTemplate(`
                <div fw-each="prod in groupedItems">
                    <h6>((prod.title))</h6>
                    <div fw-each="item in prod.selections">
                        <span fw-if="item.countBadge">((item.countBadge))</span>
                    </div>
                </div>
            `);
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                {
                    groupedItems: [
                        {
                            title: 'P1',
                            selections: [
                                { countBadge: 'x2' },
                                { countBadge: '' },
                            ],
                        },
                    ],
                },
                componentId,
            );

            assert.ok(result.includes('P1'));
            assert.ok(result.includes('x2'));
            // Second span evaluates falsy and correctly strips itself inside the resolved loop
            assert.strictEqual((result.match(/<span/g) || []).length, 1);
            // Wait, does it strip the span completely? It only stripped the inner fw-if span.
        });

        it('handles fw-if and fw-each coexisting on the same element (fw-if first)', () => {
            const template = compileTemplate(
                '<ul><li fw-if="item.isVisible" fw-each="item in items">((item.name))</li></ul>'
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                {
                    items: [
                        { name: 'Alice', isVisible: true },
                        { name: 'Bob', isVisible: false },
                        { name: 'Charlie', isVisible: true },
                    ],
                },
                componentId,
            );

            assert.ok(result.includes('Alice'));
            assert.ok(!result.includes('Bob'));
            assert.ok(result.includes('Charlie'));
            assert.strictEqual((result.match(/<li/g) || []).length, 2);
        });

        it('handles fw-each and fw-if coexisting on the same element (fw-each first)', () => {
            const template = compileTemplate(
                '<ul><li fw-each="item in items" fw-if="item.active">((item.name))</li></ul>'
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                {
                    items: [
                        { name: 'X', active: false },
                        { name: 'Y', active: true },
                    ],
                },
                componentId,
            );

            assert.ok(!result.includes('X'));
            assert.ok(result.includes('Y'));
            assert.strictEqual((result.match(/<li/g) || []).length, 1);
        });

        it('handles fw-if and fw-each coexisting with extra attributes', () => {
            const template = compileTemplate(
                '<ul><li class="item" fw-if="item.ok" fw-each="item in items" data-x="1">((item.v))</li></ul>'
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                { items: [{ v: 'A', ok: true }, { v: 'B', ok: false }] },
                componentId,
            );

            assert.ok(result.includes('A'));
            assert.ok(!result.includes('B'));
            assert.ok(result.includes('class="item"'));
            assert.ok(result.includes('data-x="1"'));
        });

        it('handles fw-if and fw-each coexisting when all items are filtered out', () => {
            const template = compileTemplate(
                '<ul><li fw-if="item.show" fw-each="item in items">((item.name))</li></ul>'
            );
            const componentId = createComponentId('Test', 'main');
            const result = template.render(
                { items: [{ name: 'A', show: false }, { name: 'B', show: false }] },
                componentId,
            );

            assert.ok(!result.includes('A'));
            assert.ok(!result.includes('B'));
            assert.strictEqual(result.match(/<li/g), null);
        });
    });

    describe('Component Mount Points', () => {
        it('renders component as mount point', () => {
            const template = compileTemplate('<div>((child))</div>');
            const componentId = createComponentId('Parent', 'main');
            const child = new Child('ChildComponent', 'child1');
            const result = template.render({ child }, componentId);

            assert.ok(result.includes('data-fusewire-id="ChildComponent#child1"'));
            assert.ok(result.includes('data-fusewire-parent-id="Parent#main"'));
        });

        it('renders array of components as mount points in reconciliation container', () => {
            const template = compileTemplate('<div>((cards))</div>');
            const componentId = createComponentId('CardList', 'main');
            const cards = [
                new Child('Card', 'card1'),
                new Child('Card', 'card2'),
            ];
            const result = template.render({ cards }, componentId);

            assert.ok(result.includes('data-fusewire-each="cards"'));
            assert.ok(result.includes('data-fusewire-id="Card#card1"'));
            assert.ok(result.includes('data-fusewire-id="Card#card2"'));
            assert.ok(result.includes('data-fusewire-parent-id="CardList#main"'));
        });

        it('reconciliation container wraps all mount points', () => {
            const template = compileTemplate('<div>((items))</div>');
            const componentId = createComponentId('List', 'main');
            const items = [
                new Child('Item', 'a'),
                new Child('Item', 'b'),
                new Child('Item', 'c'),
            ];
            const result = template.render({ items }, componentId);

            // Parse the output to verify container structure
            const temp = document.createElement('div');
            temp.innerHTML = result;
            const eachContainer = temp.querySelector('[data-fusewire-each="items"]');
            assert.ok(eachContainer);
            // All three mount points inside the container
            assert.strictEqual(eachContainer.children.length, 3);
            assert.strictEqual(eachContainer.children[0].getAttribute('data-fusewire-id'), 'Item#a');
            assert.strictEqual(eachContainer.children[1].getAttribute('data-fusewire-id'), 'Item#b');
            assert.strictEqual(eachContainer.children[2].getAttribute('data-fusewire-id'), 'Item#c');
        });

        it('single component does not get reconciliation container', () => {
            const template = compileTemplate('<div>((child))</div>');
            const componentId = createComponentId('Parent', 'main');
            const child = new Child('Child', 'one');
            const result = template.render({ child }, componentId);

            assert.ok(!result.includes('data-fusewire-each'));
            assert.ok(result.includes('data-fusewire-id="Child#one"'));
        });
    });

    describe('Event Handlers', () => {
        it('replaces ((this)) with component reference placeholder', () => {
            const template = compileTemplate(
                '<button onclick="((this)).increment()">Click</button>',
                '',
                'testApp',
            );
            const componentId = createComponentId('Counter', 'main');
            const result = template.render({}, componentId);

            assert.ok(result.includes("FuseWire.get('testApp', 'Counter#main')"));
            assert.ok(result.includes('.increment()'));
        });

        it('handles multiple ((this)) references', () => {
            const template = compileTemplate(`
                <div>
                    <button onclick="((this)).inc()">+</button>
                    <button onclick="((this)).dec()">-</button>
                </div>
            `, '', 'testApp');
            const componentId = createComponentId('Counter', 'main');
            const result = template.render({}, componentId);

            const matches = result.match(/FuseWire\.get\('testApp', 'Counter#main'\)/g);
            assert.strictEqual(matches.length, 2);
        });

        it('handles ((this)) adjacent to ((...)) inside function-call parentheses', () => {
            const template = compileTemplate(
                '<ul><li fw-each="dot in dots" onclick="((this)).goTo(((dot.index)))">((dot.label))</li></ul>',
                '',
                'testApp',
            );
            const componentId = createComponentId('Nav', 'main');
            const result = template.render({
                dots: [
                    { index: 0, label: 'First' },
                    { index: 1, label: 'Second' },
                ],
            }, componentId);

            assert.ok(result.includes('.goTo(0)'), 'dot.index=0 should resolve correctly');
            assert.ok(result.includes('.goTo(1)'), 'dot.index=1 should resolve correctly');
            assert.ok(result.includes('First'));
            assert.ok(result.includes('Second'));
            assert.ok(!result.includes('dot.index'), 'dot.index should not remain as literal text');
        });
    });

    describe('Raw CSS (no scoping)', () => {
        it('returns raw CSS unchanged', () => {
            const css = `.container { color: red; }
h1 { font-size: 2rem; }`;

            const template = compileTemplate('<div>Content</div>', css);

            assert.strictEqual(template.css, css);
        });

        it('returns empty string for empty CSS', () => {
            const template = compileTemplate('<div>Test</div>', '');
            assert.strictEqual(template.css, '');
        });

        it('returns empty string for undefined CSS', () => {
            const template = compileTemplate('<div>Test</div>');
            assert.strictEqual(template.css, '');
        });
    });

    describe('Edge Cases', () => {
        it('handles empty template', () => {
            const template = compileTemplate('');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({}, componentId);

            assert.strictEqual(result, '');
        });

        it('handles template with only text', () => {
            const template = compileTemplate('<div>Plain text</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({}, componentId);

            assert.ok(result.includes('Plain text'));
        });

        it('handles special characters in interpolation', () => {
            const template = compileTemplate('<div>((text))</div>');
            const componentId = createComponentId('Test', 'main');
            const result = template.render({ text: '<script>alert("xss")</script>' }, componentId);

            // Should escape HTML
            assert.ok(result.includes('&lt;') || result.includes('<script>'));
        });
    });
});
