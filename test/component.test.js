import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Component } from '../src/component.js';
import { ComponentReference } from '../src/component-reference.js';

describe('Component', () => {
	describe('Constructor', () => {
		it('creates instance with default values', () => {
			const comp = new Component();
			assert.deepStrictEqual(comp.componentVars, {});
			assert.deepStrictEqual(comp.vars, {});
			assert.strictEqual(comp.componentContainer, null);
			assert.strictEqual(comp.componentParent, null);
			assert.strictEqual(comp.componentName, '');
			assert.strictEqual(comp.componentId, '');
			assert.strictEqual(comp.componentVersion, '');
		});

		it('creates instance with vars', () => {
			const comp = new Component({ count: 0 });
			assert.deepStrictEqual(comp.componentVars, { count: 0 });
			assert.deepStrictEqual(comp.vars, { count: 0 });
		});

		it('vars getter returns componentVars', () => {
			const comp = new Component({ count: 0 });
			assert.strictEqual(comp.vars, comp.componentVars);
			comp.componentVars.count = 5;
			assert.strictEqual(comp.vars.count, 5);
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
				constructor(vars) {
					super(vars);
					this.hydrateCalled = false;
					this.updateCalled = false;
					this.destroyCalled = false;
					this.afterRenderCalled = false;
				}

				async hydrate() {
					this.hydrateCalled = true;
				}

				update(newVars, react = true) {
					this.updateCalled = true;
					this.receivedVars = newVars;
					super.update(newVars, react);
				}

				destroy() {
					this.destroyCalled = true;
				}

				afterRender() {
					this.afterRenderCalled = true;
				}
			}

			const comp = new TestComponent({ count: 0 });

			await comp.hydrate();
			assert.strictEqual(comp.hydrateCalled, true);

			comp.update({ count: 1 }, false);
			assert.strictEqual(comp.updateCalled, true);
			assert.deepStrictEqual(comp.receivedVars, { count: 1 });
			assert.strictEqual(comp.vars.count, 1, 'vars should be merged');

			comp.destroy();
			assert.strictEqual(comp.destroyCalled, true);

			comp.afterRender();
			assert.strictEqual(comp.afterRenderCalled, true);
		});
	});

	describe('update()', () => {
		it('shallow-merges newVars into componentVars', () => {
			const comp = new Component({ a: 1, b: 2 });
			comp.update({ b: 99, c: 3 }, false);
			assert.deepStrictEqual(comp.vars, { a: 1, b: 99, c: 3 });
		});

		it('triggers react() by default', () => {
			const comp = new Component({ x: 0 });
			comp.componentName = 'Test';
			comp.componentId = 'u1';
			const reactCalls = [];
			comp._reactor = {
				react(code, mode) {
					reactCalls.push({ code, mode });
				},
			};

			comp.update({ x: 5 });
			assert.strictEqual(comp.vars.x, 5);
			assert.strictEqual(reactCalls.length, 1);
			assert.strictEqual(reactCalls[0].code, 'Test#u1');
		});

		it('does not react when react=false', () => {
			const comp = new Component({ x: 0 });
			comp.componentName = 'Test';
			comp.componentId = 'u1';
			const reactCalls = [];
			comp._reactor = {
				react(code, mode) {
					reactCalls.push({ code, mode });
				},
			};

			comp.update({ x: 5 }, false);
			assert.strictEqual(comp.vars.x, 5);
			assert.strictEqual(reactCalls.length, 0);
		});
	});

	describe('react()', () => {
		it('calls reactor.react when attached', () => {
			const comp = new Component();
			comp.componentName = 'Component';
			comp.componentId = 'test';
			const reactCalls = [];

			comp._reactor = {
				react(componentCode, mode) {
					reactCalls.push({ componentCode, mode });
				},
			};

			comp.react('CSR');

			assert.strictEqual(reactCalls.length, 1);
			assert.strictEqual(reactCalls[0].componentCode, 'Component#test');
			assert.strictEqual(reactCalls[0].mode, 'CSR');
		});

		it('defaults to CSR mode', () => {
			const comp = new Component();
			comp.componentName = 'Component';
			comp.componentId = 'test';
			const reactCalls = [];

			comp._reactor = {
				react(componentCode, mode) {
					reactCalls.push({ mode });
				},
			};

			comp.react();

			assert.strictEqual(reactCalls[0].mode, 'CSR');
		});
	});

	describe('Subclassing', () => {
		it('inherits from Component', () => {
			class Counter extends Component {}

			const counter = new Counter({ count: 0 });
			assert.ok(counter instanceof Component);
			assert.ok(counter instanceof Counter);
		});

		it('allows adding custom methods', () => {
			class Counter extends Component {

				increment() {
					this.vars.count++;
				}

				decrement() {
					this.vars.count--;
				}
			}

			const counter = new Counter({ count: 5 });
			counter.increment();
			assert.strictEqual(counter.vars.count, 6);
			counter.decrement();
			assert.strictEqual(counter.vars.count, 5);
		});
	});

	describe('Vars Management', () => {
		it('allows direct vars mutation', () => {
			const comp = new Component({ count: 0 });
			comp.vars.count = 10;
			assert.strictEqual(comp.vars.count, 10);
		});

		it('allows nested object vars', () => {
			const comp = new Component({
				user: {
					name: 'Alice',
					profile: {
						role: 'admin',
					},
				},
			});

			assert.strictEqual(comp.vars.user.name, 'Alice');
			assert.strictEqual(comp.vars.user.profile.role, 'admin');
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
