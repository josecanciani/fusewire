import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TemplateStore } from '../src/template-store.js';

describe('TemplateStore', () => {
	describe('Constructor', () => {
		it('creates empty store', () => {
			const store = new TemplateStore();
			assert.ok(store);
		});
	});

	describe('set() and get()', () => {
		it('stores and retrieves template', () => {
			const store = new TemplateStore();
			const template = {
				version: 'a1b2c3d4e5f6',
				htmlCode: '<div>Hello</div>',
				cssCode: '.container { color: red; }',
			};

			store.set('Test', template);
			const retrieved = store.get('Test');

			assert.deepStrictEqual(retrieved, template);
		});

		it('stores template with only htmlCode and version', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
			});

			const retrieved = store.get('Test');
			assert.strictEqual(retrieved.version, 'abc123');
			assert.strictEqual(retrieved.htmlCode, '<div>Hello</div>');
			assert.strictEqual(retrieved.cssCode, '');
		});

		it('returns null for non-existent template', () => {
			const store = new TemplateStore();
			const retrieved = store.get('NonExistent');
			assert.strictEqual(retrieved, null);
		});

		it('overwrites existing template', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>First</div>',
			});
			store.set('Test', {
				version: 'v2',
				htmlCode: '<div>Second</div>',
			});

			const retrieved = store.get('Test');
			assert.strictEqual(retrieved.version, 'v2');
			assert.strictEqual(retrieved.htmlCode, '<div>Second</div>');
		});
	});

	describe('has()', () => {
		it('returns true for existing template', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
			});
			assert.strictEqual(store.has('Test'), true);
		});

		it('returns false for non-existent template', () => {
			const store = new TemplateStore();
			assert.strictEqual(store.has('NonExistent'), false);
		});
	});

	describe('getVersion()', () => {
		it('returns version for existing template', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'a1b2c3d4e5f6',
				htmlCode: '<div>Test</div>',
			});
			assert.strictEqual(store.getVersion('Test'), 'a1b2c3d4e5f6');
		});

		it('returns null for non-existent template', () => {
			const store = new TemplateStore();
			assert.strictEqual(store.getVersion('NonExistent'), null);
		});
	});

	describe('clear()', () => {
		it('removes template', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
			});

			assert.strictEqual(store.has('Test'), true);
			store.clear('Test');
			assert.strictEqual(store.has('Test'), false);
		});

		it('does nothing for non-existent template', () => {
			const store = new TemplateStore();
			store.clear('NonExistent'); // Should not throw
		});

		it('clears compiled template too', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
			});
			store.setCompiled('Test', { render: () => {} });

			assert.ok(store.getCompiled('Test'));
			store.clear('Test');
			assert.strictEqual(store.getCompiled('Test'), null);
		});
	});

	describe('Compiled Template Cache', () => {
		it('stores and retrieves compiled template', () => {
			const store = new TemplateStore();
			const compiled = {
				render: () => '<div>Rendered</div>',
				css: '.container { color: blue; }',
			};

			store.setCompiled('Test', compiled);
			const retrieved = store.getCompiled('Test');

			assert.strictEqual(retrieved, compiled);
		});

		it('returns null for non-existent compiled template', () => {
			const store = new TemplateStore();
			const retrieved = store.getCompiled('NonExistent');
			assert.strictEqual(retrieved, null);
		});

		it('clears compiled cache when template changes', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>First</div>',
			});
			store.setCompiled('Test', { render: () => 'First' });

			assert.ok(store.getCompiled('Test'));

			// Update template
			store.set('Test', {
				version: 'v2',
				htmlCode: '<div>Second</div>',
			});

			// Compiled cache should be cleared
			assert.strictEqual(store.getCompiled('Test'), null);
		});
	});

	describe('clearAll()', () => {
		it('removes all templates', () => {
			const store = new TemplateStore();
			store.set('Test1', {
				version: 'v1',
				htmlCode: '<div>1</div>',
			});
			store.set('Test2', {
				version: 'v2',
				htmlCode: '<div>2</div>',
			});
			store.setCompiled('Test1', { render: () => {} });

			assert.strictEqual(store.has('Test1'), true);
			assert.strictEqual(store.has('Test2'), true);
			assert.ok(store.getCompiled('Test1'));

			store.clearAll();

			assert.strictEqual(store.has('Test1'), false);
			assert.strictEqual(store.has('Test2'), false);
			assert.strictEqual(store.getCompiled('Test1'), null);
		});
	});

	describe('Multiple Stores', () => {
		it('stores are independent', () => {
			const store1 = new TemplateStore();
			const store2 = new TemplateStore();

			store1.set('Test', {
				version: 'v1',
				htmlCode: '<div>Store 1</div>',
			});
			store2.set('Test', {
				version: 'v2',
				htmlCode: '<div>Store 2</div>',
			});

			assert.strictEqual(store1.get('Test').htmlCode, '<div>Store 1</div>');
			assert.strictEqual(store2.get('Test').htmlCode, '<div>Store 2</div>');
		});
	});

	describe('Hash Computation', () => {
		it('computes deterministic hash', async () => {
			const store = new TemplateStore();
			const content = 'test content';

			const hash1 = await store._computeHash(content);
			const hash2 = await store._computeHash(content);

			assert.strictEqual(hash1, hash2);
			assert.strictEqual(hash1.length, 12);
		});

		it('different content produces different hash', async () => {
			const store = new TemplateStore();

			const hash1 = await store._computeHash('content 1');
			const hash2 = await store._computeHash('content 2');

			assert.notStrictEqual(hash1, hash2);
		});
	});
});
