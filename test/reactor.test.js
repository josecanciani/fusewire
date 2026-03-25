import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Reactor } from '../src/reactor.js';
import { Component } from '../src/component.js';

describe('Reactor', () => {
	describe('Constructor', () => {
		it('creates reactor instance', () => {
			const reactor = new Reactor();
			assert.ok(reactor);
			assert.ok(reactor._instances instanceof Map);
			assert.ok(reactor._containers instanceof Map);
		});
	});

	describe('start()', () => {
		it('creates and starts a root component', () => {
			class Counter extends Component {
				static componentName = 'Counter';
			}

			const reactor = new Reactor();
			const container = {}; // Mock container
			const instance = reactor.start(container, Counter, 'main', { count: 0 });

			assert.ok(instance);
			assert.ok(instance instanceof Counter);
			assert.strictEqual(instance.id, 'Counter#main');
			assert.deepStrictEqual(instance.vars, { count: 0 });
		});

		it('attaches reactor to component', () => {
			class Counter extends Component {
				static componentName = 'Counter';
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			assert.strictEqual(instance._reactor, reactor);
		});

		it('stores instance and container', () => {
			class Counter extends Component {
				static componentName = 'Counter';
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			assert.strictEqual(reactor._instances.get('Counter#main'), instance);
			assert.strictEqual(reactor._containers.get('Counter#main'), container);
		});

		it('calls hydrate hook', () => {
			class Counter extends Component {
				static componentName = 'Counter';

				hydrate() {
					this.hydrateCalled = true;
				}
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			assert.strictEqual(instance.hydrateCalled, true);
		});
	});

	describe('react()', () => {
		it('calls update hook on component', () => {
			class Counter extends Component {
				static componentName = 'Counter';

				update() {
					this.updateCalled = true;
				}
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			instance.updateCalled = false;
			reactor.react(instance, 'CSR');

			assert.strictEqual(instance.updateCalled, true);
		});

		it('defaults to CSR mode', () => {
			class Counter extends Component {
				static componentName = 'Counter';

				update() {
					this.updateCalled = true;
				}
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			instance.updateCalled = false;
			reactor.react(instance); // No mode specified

			assert.strictEqual(instance.updateCalled, true);
		});

		it('throws for unsupported render mode', () => {
			class Counter extends Component {
				static componentName = 'Counter';
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', {});

			assert.throws(
				() => reactor.react(instance, 'SSR'),
				/Unsupported render mode "SSR"/,
			);
		});
	});

	describe('Component integration', () => {
		it('allows component to call react() method', () => {
			class Counter extends Component {
				static componentName = 'Counter';

				increment() {
					this.vars.count++;
					this.react(); // Should trigger reactor.react()
				}

				update() {
					this.updateCalled = true;
				}
			}

			const reactor = new Reactor();
			const container = {};
			const instance = reactor.start(container, Counter, 'main', { count: 0 });

			instance.updateCalled = false;
			instance.increment();

			assert.strictEqual(instance.vars.count, 1);
			assert.strictEqual(instance.updateCalled, true);
		});
	});
});
