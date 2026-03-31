import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { Component } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { ComponentReference } from '../src/component-reference.js';
import { COMPONENT_ID, REGISTRY_ENTRY, CONSOLE, REACTOR, LIFECYCLE_ACTIVE, EVENTS } from '../src/symbols.js';

describe('Component', () => {
	describe('Constructor', () => {
		it('creates instance with default values', () => {
			const comp = new Component();
			assert.ok(comp instanceof Component);
		});

		it('creates instance with vars', () => {
			const comp = Object.assign(new Component(), { count: 0 });
			assert.strictEqual(comp.count, 0);
		});

	});

	describe('Lifecycle Hooks', () => {
		it('has default init hook', async () => {
			const comp = new Component();
			await comp.init(); // Should not throw
		});

		it('has default update method', () => {
			const comp = new Component();
			comp.update({}, false); // react=false since no reactor attached
		});

		it('has default destroy hook', () => {
			const comp = new Component();
			comp.destroy(); // Should not throw
		});

		it('has default afterRender hook', () => {
			const comp = new Component();
			comp.afterRender(); // Should not throw
		});

		it('allows overriding hooks', async () => {
			class TestComponent extends Component {
				constructor() {
					super();
					this._initCalled = false;
					this._updateCalled = false;
					this._destroyCalled = false;
					this._afterRenderCalled = false;
				}

				async init() {
					this._initCalled = true;
				}

				update(newVars, react = true) {
					this._updateCalled = true;
					this._receivedVars = newVars;
					super.update(newVars, react);
				}

				destroy() {
					this._destroyCalled = true;
				}

				afterRender() {
					this._afterRenderCalled = true;
				}
			}

			const comp = Object.assign(new TestComponent(), { count: 0 });

			await comp.init();
			assert.strictEqual(comp._initCalled, true);

			comp.update({ count: 1 }, false);
			assert.strictEqual(comp._updateCalled, true);
			assert.deepStrictEqual(comp._receivedVars, { count: 1 });
			assert.strictEqual(comp.count, 1, 'vars should be merged');

			comp.destroy();
			assert.strictEqual(comp._destroyCalled, true);

			comp.afterRender();
			assert.strictEqual(comp._afterRenderCalled, true);
		});
	});

	describe('update()', () => {
		it('shallow-merges newVars into componentVars', () => {
			const comp = Object.assign(new Component(), { a: 1, b: 2 });
			comp.update({ b: 99, c: 3 }, false);
			assert.strictEqual(comp.a, 1);
			assert.strictEqual(comp.b, 99);
			assert.strictEqual(comp.c, 3);
		});

		it('triggers react() by default', () => {
			const comp = Object.assign(new Component(), { x: 0 });
			comp[COMPONENT_ID] = new ComponentId('Test', 'u1');
			const reactCalls = [];
			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ code: componentId.code, mode });
				},
			};

			comp.update({ x: 5 });
			assert.strictEqual(comp.x, 5);
			assert.strictEqual(reactCalls.length, 1);
			assert.strictEqual(reactCalls[0].code, 'Test#u1');
		});

		it('does not react when react=false', () => {
			const comp = Object.assign(new Component(), { x: 0 });
			comp[COMPONENT_ID] = new ComponentId('Test', 'u1');
			const reactCalls = [];
			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ code: componentId.code, mode });
				},
			};

			comp.update({ x: 5 }, false);
			assert.strictEqual(comp.x, 5);
			assert.strictEqual(reactCalls.length, 0);
		});
	});

	describe('react()', () => {
		it('calls reactor.react when attached', () => {
			const comp = new Component();
			comp[COMPONENT_ID] = new ComponentId('Component', 'test');
			const reactCalls = [];

			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ code: componentId.code, mode });
				},
			};

			comp.react('CSR');

			assert.strictEqual(reactCalls.length, 1);
			assert.strictEqual(reactCalls[0].code, 'Component#test');
			assert.strictEqual(reactCalls[0].mode, 'CSR');
		});

		it('defaults to CSR mode', () => {
			const comp = new Component();
			comp[COMPONENT_ID] = new ComponentId('Component', 'test');
			const reactCalls = [];

			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ mode });
				},
			};

			comp.react();

			assert.strictEqual(reactCalls[0].mode, 'CSR');
		});

		it('skips react() and warns when LIFECYCLE_ACTIVE is set', () => {
			const comp = new Component();
			comp[COMPONENT_ID] = new ComponentId('Component', 'test');
			const reactCalls = [];
			const warnings = [];

			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ code: componentId.code, mode });
				},
			};
			comp[CONSOLE] = {
				log() {},
				warn(...args) { warnings.push(args); },
				error() {},
			};

			comp[LIFECYCLE_ACTIVE] = 'init';
			comp.react();

			assert.strictEqual(reactCalls.length, 0, 'reactor.react should not be called');
			assert.strictEqual(warnings.length, 1, 'should warn once');
			assert.ok(
				warnings[0][0].includes('init'),
				'warning should mention the active lifecycle hook',
			);
		});

		it('allows react() when LIFECYCLE_ACTIVE is null', () => {
			const comp = new Component();
			comp[COMPONENT_ID] = new ComponentId('Component', 'test');
			const reactCalls = [];

			comp[REACTOR] = {
				react(componentId, mode) {
					reactCalls.push({ code: componentId.code, mode });
				},
			};

			comp[LIFECYCLE_ACTIVE] = null;
			comp.react();

			assert.strictEqual(reactCalls.length, 1);
		});
	});

	describe('Subclassing', () => {
		it('inherits from Component', () => {
			class Counter extends Component {}

			const counter = Object.assign(new Counter(), { count: 0 });
			assert.ok(counter instanceof Component);
			assert.ok(counter instanceof Counter);
		});

		it('allows adding custom methods', () => {
			class Counter extends Component {

				increment() {
					this.count++;
				}

				decrement() {
					this.count--;
				}
			}

			const counter = Object.assign(new Counter(), { count: 5 });
			counter.increment();
			assert.strictEqual(counter.count, 6);
			counter.decrement();
			assert.strictEqual(counter.count, 5);
		});
	});

	describe('Vars Management', () => {
		it('allows direct vars mutation', () => {
			const comp = Object.assign(new Component(), { count: 0 });
			comp.count = 10;
			assert.strictEqual(comp.count, 10);
		});

		it('allows nested object vars', () => {
			const comp = Object.assign(new Component(), {
				user: {
					name: 'Alice',
					profile: {
						role: 'admin',
					},
				},
			});

			assert.strictEqual(comp.user.name, 'Alice');
			assert.strictEqual(comp.user.profile.role, 'admin');
		});
	});

	describe('migrateVars()', () => {
		it('has default implementation that returns vars unchanged', () => {
			const vars = { count: 5, name: 'test' };
			const migrated = Component.migrateVars(vars);
			assert.deepStrictEqual(migrated, vars);
		});

		it('can be overridden in subclass', () => {
			class Counter extends Component {
				static CURRENT_VERSION = 2;

				static migrateVars(vars) {
					// Example: renamed 'counter' to 'count' in v2
					if ('counter' in vars && !('count' in vars)) {
						return { ...vars, count: vars.counter };
					}
					return vars;
				}
			}

			const oldVars = { counter: 10 };
			const migrated = Counter.migrateVars(oldVars);

			assert.strictEqual(migrated.count, 10);
			assert.strictEqual(migrated.counter, 10); // Old field preserved
		});

		it('allows developer-maintained version tracking', () => {
			class MyComponent extends Component {
				static CURRENT_VERSION = 3;

				static migrateVars(vars) {
					const fromVersion = vars._version || 1;
					let migrated = { ...vars };

					if (fromVersion < 2) {
						// v1 → v2: add new field
						migrated.newField = 'default';
					}

					if (fromVersion < 3) {
						// v2 → v3: rename field
						migrated.renamedField = migrated.oldField;
						delete migrated.oldField;
					}

					migrated._version = MyComponent.CURRENT_VERSION;
					return migrated;
				}
			}

			const oldVars = { _version: 1, oldField: 'value' };
			const migrated = MyComponent.migrateVars(oldVars);

			assert.strictEqual(migrated._version, 3);
			assert.strictEqual(migrated.newField, 'default');
			assert.strictEqual(migrated.renamedField, 'value');
			assert.strictEqual(migrated.oldField, undefined);
		});
	});

	describe('createChild()', () => {
		it('returns a ComponentReference with correct componentName, id, and vars', () => {
			const comp = new Component();
			const ref = comp.createChild('Sidebar', 'main', { collapsed: false });

			assert.strictEqual(ref.componentName, 'Sidebar');
			assert.strictEqual(ref.id, 'main');
			assert.deepStrictEqual(ref.vars, { collapsed: false });
		});

		it('returns a ComponentReference with empty id when id is omitted', () => {
			const comp = new Component();
			const ref = comp.createChild('Sidebar', { collapsed: true });

			assert.strictEqual(ref.componentName, 'Sidebar');
			assert.strictEqual(ref.id, '');
			assert.deepStrictEqual(ref.vars, { collapsed: true });
		});

		it('returns a ComponentReference with empty id and empty vars when only name is given', () => {
			const comp = new Component();
			const ref = comp.createChild('Sidebar');

			assert.strictEqual(ref.componentName, 'Sidebar');
			assert.strictEqual(ref.id, '');
			assert.deepStrictEqual(ref.vars, {});
		});

		it('returns an instance of ComponentReference', () => {
			const comp = new Component();
			const ref = comp.createChild('Sidebar', 'main', { collapsed: false });

			assert.ok(ref instanceof ComponentReference);
		});
	});

	describe('Event pub/sub', () => {
		it('on() registers a handler that emit() calls', () => {
			const comp = new Component();
			const calls = [];
			comp.on('change', () => calls.push('called'));
			comp.emit('change');
			assert.strictEqual(calls.length, 1);
		});

		it('emit() forwards all arguments to the handler', () => {
			const comp = new Component();
			const received = [];
			comp.on('select', (...args) => received.push(args));
			comp.emit('select', 'foo', 42);
			assert.deepStrictEqual(received, [['foo', 42]]);
		});

		it('multiple handlers for the same event are all called', () => {
			const comp = new Component();
			const log = [];
			comp.on('ping', () => log.push('a'));
			comp.on('ping', () => log.push('b'));
			comp.emit('ping');
			assert.deepStrictEqual(log, ['a', 'b']);
		});

		it('handlers for different events do not cross-fire', () => {
			const comp = new Component();
			const aLog = [];
			const bLog = [];
			comp.on('a', () => aLog.push(1));
			comp.on('b', () => bLog.push(2));
			comp.emit('a');
			assert.deepStrictEqual(aLog, [1]);
			assert.deepStrictEqual(bLog, []);
		});

		it('on() returns an unsubscribe function that stops the handler', () => {
			const comp = new Component();
			const calls = [];
			const unsub = comp.on('click', () => calls.push('click'));
			comp.emit('click');
			unsub();
			comp.emit('click');
			assert.strictEqual(calls.length, 1);
		});

		it('emit() before any on() call does not throw', () => {
			const comp = new Component();
			assert.doesNotThrow(() => comp.emit('noop', 1, 2, 3));
		});

		it('EVENTS symbol key is not visible in Object.keys()', () => {
			const comp = new Component();
			comp.on('test', () => {});
			assert.ok(!Object.keys(comp).includes(EVENTS.toString()));
			assert.ok(!(String(EVENTS) in comp) || typeof EVENTS === 'symbol');
		});

		it('handlers are not called after instance[EVENTS].clear()', () => {
			const comp = new Component();
			const calls = [];
			comp.on('done', () => calls.push(1));
			comp[EVENTS].clear();
			comp.emit('done');
			assert.strictEqual(calls.length, 0);
		});

		it('emit() warns when called during a lifecycle hook but still fires handlers', () => {
			const comp = new Component();
			const warnings = [];
			const calls = [];
			comp[CONSOLE] = { log() {}, warn(...args) { warnings.push(args); }, error() {} };
			comp.on('ready', () => calls.push(1));
			comp[LIFECYCLE_ACTIVE] = 'init';
			comp.emit('ready');
			assert.strictEqual(warnings.length, 1);
			assert.ok(warnings[0][0].includes('init'), 'warning should mention the lifecycle hook');
			assert.ok(warnings[0][0].includes('ready'), 'warning should mention the event name');
			assert.strictEqual(calls.length, 1, 'handler should still be called');
		});

		it('emit() calls all handlers even if one throws, and logs the error', () => {
			const comp = new Component();
			const errors = [];
			const calls = [];
			comp[CONSOLE] = { log() {}, warn() {}, error(...args) { errors.push(args); } };
			comp.on('tick', () => { throw new Error('boom'); });
			comp.on('tick', () => calls.push('ran'));
			comp.emit('tick');
			assert.strictEqual(calls.length, 1, 'second handler should still run');
			assert.strictEqual(errors.length, 1, 'error should be logged');
			assert.ok(errors[0][0].includes('boom'), 'log should include the error message');
		});
	});

	describe('Scoped DOM queries', () => {
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
			const cid = new ComponentId(name, id);
			comp[COMPONENT_ID] = cid;
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', cid.code);
			container.innerHTML = containerHTML;
			document.body.appendChild(container);
			comp[REGISTRY_ENTRY] = { instance: comp, container, parent: null, children: null };
			return comp;
		}

		describe('querySelector()', () => {
			it('finds an element in the component own DOM', () => {
				const comp = makeComponent('Panel', 'main', '<div class="logs">own</div>');
				const el = comp.querySelector('.logs');
				assert.ok(el);
				assert.strictEqual(el.textContent, 'own');
			});

			it('skips elements inside a child mount point', () => {
				const comp = makeComponent('Panel', 'main', [
					'<div class="logs">own</div>',
					'<div data-fusewire-id="Child#1" data-fusewire-parent-id="Panel#main">',
					'  <div class="logs">child</div>',
					'</div>',
				].join(''));
				const el = comp.querySelector('.logs');
				assert.ok(el);
				assert.strictEqual(el.textContent, 'own');
			});

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

		describe('querySelectorAll()', () => {
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

			it('returns an array, not a NodeList', () => {
				const comp = makeComponent('Panel', 'main', '<div class="x">a</div>');
				const result = comp.querySelectorAll('.x');
				assert.ok(Array.isArray(result));
			});

			it('returns empty array when nothing matches', () => {
				const comp = makeComponent('Panel', 'main', '<div>nothing</div>');
				const result = comp.querySelectorAll('.missing');
				assert.strictEqual(result.length, 0);
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

			it('returns an array', () => {
				const comp = makeComponent('Panel', 'main', '<div class="x">a</div>');
				assert.ok(Array.isArray(comp.getElementsByClassName('x')));
			});

			it('returns empty array when nothing matches', () => {
				const comp = makeComponent('Panel', 'main', '<div>nothing</div>');
				assert.strictEqual(comp.getElementsByClassName('missing').length, 0);
			});
		});

		describe('_scopeSelector()', () => {
			it('appends :not() exclusion to a simple selector', () => {
				const comp = makeComponent('Panel', 'main', '');
				const scoped = comp._scopeSelector('.foo');
				assert.strictEqual(scoped, '.foo:not([data-fusewire-parent-id="Panel#main"] *)');
			});

			it('handles comma-separated selectors', () => {
				const comp = makeComponent('Panel', 'main', '');
				const scoped = comp._scopeSelector('.a, .b');
				assert.strictEqual(
					scoped,
					'.a:not([data-fusewire-parent-id="Panel#main"] *), .b:not([data-fusewire-parent-id="Panel#main"] *)',
				);
			});

			it('escapes quotes in component code', () => {
				const comp = makeComponent('Pa"nel', 'main', '');
				const scoped = comp._scopeSelector('.x');
				assert.ok(scoped.includes('Pa\\"nel'));
			});

			it('uses component code without id when id is empty', () => {
				const comp = makeComponent('Panel', '', '');
				const scoped = comp._scopeSelector('.x');
				assert.strictEqual(scoped, '.x:not([data-fusewire-parent-id="Panel"] *)');
			});
		});
	});
});
