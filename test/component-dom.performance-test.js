import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { Component } from '../src/component.js';
import { createComponentId, componentIdFromCode, componentIdsEqual } from '../src/component-id.js';
import { COMPONENT_ID, REGISTRY_ENTRY } from '../src/symbols.js';

describe('Scoped DOM queries (Thorough)', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost',
        });
        document = dom.window.document;
        global.document = document;
        // JSDOM does not implement CSS.escape — polyfill for tests
        if (!global.CSS) global.CSS = {};
        if (!global.CSS.escape) {
            global.CSS.escape = (v) =>
                String(v).replace(/([^\w-])/g, '\\$1');
        }
    });

    /**
     * Build a Component wired to a real DOM container.
     * @param {string} name - Component name
     * @param {string} id - Instance id
     * @param {string} containerHTML - innerHTML for the container
     * @returns {Component} The wired component
     */
    function makeComponent(name, id, containerHTML) {
        const comp = new Component();
        const cid = createComponentId(name, id);
        comp[COMPONENT_ID] = cid;
        const container = document.createElement('div');
        container.setAttribute('data-fusewire-id', cid.code);
        container.innerHTML = containerHTML;
        document.body.appendChild(container);
        comp[REGISTRY_ENTRY] = { instance: comp, container, parent: null, children: null };
        return comp;
    }

    describe('querySelector() edge cases', () => {
        it('returns null when only matches are inside children', () => {
            const comp = makeComponent('Panel', 'main', [
                '<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
                '  <div class="only-in-child">child</div>',
                '</div>',
            ].join(''));
            assert.strictEqual(comp.querySelector('.only-in-child'), null);
        });

        it('skips elements inside grandchild mount points', () => {
            const comp = makeComponent('Panel', 'main', [
                '<div class="item">own</div>',
                '<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
                '  <div data-fusewire-id="Grand#1" data-fusewire-parent-id="Child#1">',
                '    <div class="item">grandchild</div>',
                '  </div>',
                '</div>',
            ].join(''));
            const el = comp.querySelector('.item');
            assert.ok(el);
            assert.strictEqual(el.textContent, 'own');
        });

        it('works with compound selectors', () => {
            const comp = makeComponent('App', 'main', [
                '<button class="btn red">own</button>',
                '<div data-fusewire-id="Toolbar" data-fusewire-parent-id="App#main">',
                '  <button class="btn red">child</button>',
                '</div>',
            ].join(''));
            const el = comp.querySelector('.btn.red');
            assert.ok(el);
            assert.strictEqual(el.textContent, 'own');
        });
    });

    describe('querySelectorAll() thoroughness', () => {
        it('returns only elements in the component own DOM', () => {
            const comp = makeComponent('Panel', 'main', [
                '<div class="log">a</div>',
                '<div class="log">b</div>',
                '<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
                '  <div class="log">child</div>',
                '</div>',
            ].join(''));
            const els = comp.querySelectorAll('.log');
            assert.strictEqual(els.length, 2);
            assert.deepStrictEqual(els.map((e) => e.textContent), ['a', 'b']);
        });

        it('handles comma-separated selectors', () => {
            const comp = makeComponent('Panel', 'main', [
                '<div class="a">a</div>',
                '<span class="b">b</span>',
                '<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
                '  <div class="a">child-a</div>',
                '  <span class="b">child-b</span>',
                '</div>',
            ].join(''));
            const els = comp.querySelectorAll('.a, .b');
            assert.strictEqual(els.length, 2);
            assert.deepStrictEqual(els.map((e) => e.textContent), ['a', 'b']);
        });
    });

    describe('getElementsByClassName()', () => {
        it('finds elements by a single class name', () => {
            const comp = makeComponent('Panel', 'main', [
                '<div class="log">own</div>',
                '<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
                '  <div class="log">child</div>',
                '</div>',
            ].join(''));
            const els = comp.getElementsByClassName('log');
            assert.strictEqual(els.length, 1);
            assert.strictEqual(els[0].textContent, 'own');
        });

        it('finds elements matching multiple space-separated class names', () => {
            const comp = makeComponent('App', 'main', [
                '<button class="btn red">own</button>',
                '<button class="btn">also own</button>',
                '<div data-fusewire-id="Toolbar" data-fusewire-parent-id="App#main">',
                '  <button class="btn red">child</button>',
                '</div>',
            ].join(''));
            const els = comp.getElementsByClassName('btn red');
            assert.strictEqual(els.length, 1);
            assert.strictEqual(els[0].textContent, 'own');
        });
    });

    describe('_scopeSelector()', () => {
        it('appends :not() exclusion to a simple selector', () => {
            const comp = makeComponent('Panel', 'main', '');
            const scoped = comp._scopeSelector('.foo');
            assert.strictEqual(scoped, '.foo:not([data-fusewire-parent-id="Panel#main"] *)');
        });

        it('escapes quotes in component code', () => {
            const comp = makeComponent('Pa"nel', 'main', '');
            const scoped = comp._scopeSelector('.x');
            assert.ok(scoped.includes('Pa\\"nel'));
        });
    });
});
