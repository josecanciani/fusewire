import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Component } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { ComponentReference } from '../src/component-reference.js';
import { COMPONENT_ID, CONSOLE, REACTOR, LIFECYCLE_ACTIVE } from '../src/symbols.js';

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
		it('has default hydrate hook', async () => {
			const comp = new Component();
			await comp.hydrate(); // Should not throw
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

				destroy() {
					this._destroyCalled = true;
				}

				afterRender() {
					this._afterRenderCalled = true;
				}
			}

			const comp = Object.assign(new TestComponent(), { count: 0 });

			await comp.hydrate();
			assert.strictEqual(comp._hydrateCalled, true);

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

			comp[LIFECYCLE_ACTIVE] = 'hydrate';
			comp.react();

			assert.strictEqual(reactCalls.length, 0, 'reactor.react should not be called');
			assert.strictEqual(warnings.length, 1, 'should warn once');
			assert.ok(
				warnings[0][0].includes('hydrate'),
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
});
