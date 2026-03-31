import { describe, it, mock } from 'node:test';
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

			assert.strictEqual(retrieved.version, template.version);
			assert.strictEqual(retrieved.htmlCode, template.htmlCode);
			assert.strictEqual(retrieved.cssCode, template.cssCode);
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

		it('defaults jsCode to empty string', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
			});

			const retrieved = store.get('Test');
			assert.strictEqual(retrieved.jsCode, '');
		});

		it('stores jsCode when provided', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
				jsCode: 'export class Test {}',
			});

			const retrieved = store.get('Test');
			assert.strictEqual(retrieved.jsCode, 'export class Test {}');
		});

		it('sets fetchedAt to Date.now() when not provided', () => {
			const store = new TemplateStore();
			const before = Date.now();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
			});
			const after = Date.now();

			const retrieved = store.get('Test');
			assert.ok(retrieved.fetchedAt >= before);
			assert.ok(retrieved.fetchedAt <= after);
		});

		it('uses provided fetchedAt', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
				fetchedAt: 1000,
			});

			assert.strictEqual(store.get('Test').fetchedAt, 1000);
		});

		it('stores etags', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
				etags: { html: '"h1"', css: '"c1"', js: '"j1"' },
			});

			const etags = store.get('Test').etags;
			assert.strictEqual(etags.html, '"h1"');
			assert.strictEqual(etags.css, '"c1"');
			assert.strictEqual(etags.js, '"j1"');
		});

		it('defaults etags to empty strings', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>Hello</div>',
			});

			const etags = store.get('Test').etags;
			assert.strictEqual(etags.html, '');
			assert.strictEqual(etags.css, '');
			assert.strictEqual(etags.js, '');
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

	describe('isStale()', () => {
		it('returns false when ttlMs is 0 (never stale)', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
				fetchedAt: 1, // very old
			});
			assert.strictEqual(store.isStale('Test', 0), false);
		});

		it('returns true for non-existent template', () => {
			const store = new TemplateStore();
			assert.strictEqual(store.isStale('NonExistent', 60000), true);
		});

		it('returns false when template is fresh', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
				fetchedAt: Date.now(),
			});
			assert.strictEqual(store.isStale('Test', 60000), false);
		});

		it('returns true when template is older than TTL', () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>Test</div>',
				fetchedAt: Date.now() - 120000, // 2 minutes ago
			});
			assert.strictEqual(store.isStale('Test', 60000), true);
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

	describe('computeHash()', () => {
		it('computes deterministic hash', async () => {
			const store = new TemplateStore();
			const content = 'test content';

			const hash1 = await store.computeHash(content);
			const hash2 = await store.computeHash(content);

			assert.strictEqual(hash1, hash2);
			assert.strictEqual(hash1.length, 12);
		});

		it('different content produces different hash', async () => {
			const store = new TemplateStore();

			const hash1 = await store.computeHash('content 1');
			const hash2 = await store.computeHash('content 2');

			assert.notStrictEqual(hash1, hash2);
		});
	});

	describe('fetch()', () => {
		it('fetches HTML, CSS, and JS files in parallel', async () => {
			const store = new TemplateStore();
			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('<div>Hello</div>'),
							headers: new Map([['etag', '"h1"']]),
						});
					}
					if (url.endsWith('.css')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('.test { color: red; }'),
							headers: new Map([['etag', '"c1"']]),
						});
					}
					if (url.endsWith('.js')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('export class Test {}'),
							headers: new Map([['etag', '"j1"']]),
						});
					}
					return Promise.resolve({ ok: false });
				},
			);
			globalThis.fetch = fetchMock;

			const result = await store.fetch('Test', './components');

			assert.strictEqual(result.htmlCode, '<div>Hello</div>');
			assert.strictEqual(result.cssCode, '.test { color: red; }');
			assert.strictEqual(result.jsCode, 'export class Test {}');
			assert.strictEqual(result.etags.html, '"h1"');
			assert.strictEqual(result.etags.css, '"c1"');
			assert.strictEqual(result.etags.js, '"j1"');
			assert.ok(result.fetchedAt > 0);
			assert.strictEqual(result.version.length, 12);

			// All three fetched in a single Promise.all (3 calls total)
			assert.strictEqual(fetchMock.mock.calls.length, 3);

			// Should be stored
			assert.strictEqual(store.has('Test'), true);
			assert.strictEqual(store.get('Test').htmlCode, '<div>Hello</div>');

			mock.restoreAll();
		});

		it('handles all-304 Not Modified by refreshing fetchedAt', async () => {
			const store = new TemplateStore();

			// Pre-populate with old data
			store.set('Test', {
				version: 'oldversion12',
				htmlCode: '<div>Existing</div>',
				cssCode: '.old { }',
				jsCode: 'export class Old {}',
				fetchedAt: 1000,
				etags: { html: '"h1"', css: '"c1"', js: '"j1"' },
			});

			const fetchMock = mock.fn(() =>
				Promise.resolve({
					status: 304,
					ok: false,
					headers: new Map(),
				}),
			);
			globalThis.fetch = fetchMock;

			const before = Date.now();
			const result = await store.fetch('Test', './components');

			assert.strictEqual(result.htmlCode, '<div>Existing</div>');
			assert.strictEqual(result.cssCode, '.old { }');
			assert.strictEqual(result.jsCode, 'export class Old {}');
			assert.strictEqual(result.version, 'oldversion12');
			assert.ok(result.fetchedAt >= before);

			// All three fetched in parallel (3 calls)
			assert.strictEqual(fetchMock.mock.calls.length, 3);

			mock.restoreAll();
		});

		it('recomputes version when only CSS changes (HTML 304, CSS 200)', async () => {
			const store = new TemplateStore();

			store.set('Test', {
				version: 'oldversion12',
				htmlCode: '<div>Hello</div>',
				cssCode: '.old { }',
				jsCode: '',
				fetchedAt: 1000,
				etags: { html: '"h1"', css: '"c1"', js: '' },
			});

			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 304,
							ok: false,
							headers: new Map(),
						});
					}
					if (url.endsWith('.css')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('.new { color: blue; }'),
							headers: new Map([['etag', '"c2"']]),
						});
					}
					return Promise.resolve({ ok: false, headers: new Map() });
				},
			);
			globalThis.fetch = fetchMock;

			const result = await store.fetch('Test', './components');

			// HTML kept from existing (304), CSS updated, JS empty (404)
			assert.strictEqual(result.htmlCode, '<div>Hello</div>');
			assert.strictEqual(result.cssCode, '.new { color: blue; }');
			assert.strictEqual(result.jsCode, '');
			assert.notStrictEqual(result.version, 'oldversion12');
			// HTML etag preserved, CSS etag updated
			assert.strictEqual(result.etags.html, '"h1"');
			assert.strictEqual(result.etags.css, '"c2"');

			mock.restoreAll();
		});

		it('sends per-file If-None-Match headers', async () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'v1',
				htmlCode: '<div>old</div>',
				etags: { html: '"h1"', css: '"c1"', js: '"j1"' },
			});

			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('<div>new</div>'),
							headers: new Map([['etag', '"h2"']]),
						});
					}
					return Promise.resolve({
						status: 200,
						ok: true,
						text: () => Promise.resolve(''),
						headers: new Map(),
					});
				},
			);
			globalThis.fetch = fetchMock;

			await store.fetch('Test', './components');

			// All three calls get their own If-None-Match
			const htmlCall = fetchMock.mock.calls.find((c) => c.arguments[0].endsWith('.html'));
			const cssCall = fetchMock.mock.calls.find((c) => c.arguments[0].endsWith('.css'));
			const jsCall = fetchMock.mock.calls.find((c) => c.arguments[0].endsWith('.js'));
			assert.strictEqual(htmlCall.arguments[1].headers['If-None-Match'], '"h1"');
			assert.strictEqual(cssCall.arguments[1].headers['If-None-Match'], '"c1"');
			assert.strictEqual(jsCall.arguments[1].headers['If-None-Match'], '"j1"');

			mock.restoreAll();
		});

		it('handles missing CSS and JS gracefully', async () => {
			const store = new TemplateStore();
			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('<div>Hello</div>'),
							headers: new Map(),
						});
					}
					return Promise.resolve({ ok: false, headers: new Map() });
				},
			);
			globalThis.fetch = fetchMock;

			const result = await store.fetch('Test', './components');

			assert.strictEqual(result.htmlCode, '<div>Hello</div>');
			assert.strictEqual(result.cssCode, '');
			assert.strictEqual(result.jsCode, '');

			mock.restoreAll();
		});
	});

	describe('requestTemplate()', () => {
		it('returns cached template immediately without fetching', async () => {
			const store = new TemplateStore();
			store.set('Test', {
				version: 'abc123',
				htmlCode: '<div>cached</div>',
				cssCode: '',
				jsCode: '',
			});

			const result = await store.requestTemplate('Test', './components');

			assert.strictEqual(result.htmlCode, '<div>cached</div>');
			assert.strictEqual(result.version, 'abc123');
		});

		it('deduplicates concurrent requests for the same component', async () => {
			const store = new TemplateStore();
			let fetchCount = 0;
			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					fetchCount++;
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('<div>Hello</div>'),
							headers: new Map([['etag', '"h1"']]),
						});
					}
					if (url.endsWith('.css')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('.test { color: red; }'),
							headers: new Map([['etag', '"c1"']]),
						});
					}
					if (url.endsWith('.js')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('export class Test {}'),
							headers: new Map([['etag', '"j1"']]),
						});
					}
					return Promise.resolve({ ok: false });
				},
			);
			globalThis.fetch = fetchMock;

			// Fire two requests concurrently
			const [result1, result2] = await Promise.all([
				store.requestTemplate('Test', './components'),
				store.requestTemplate('Test', './components'),
			]);

			// Both resolve to the same data
			assert.strictEqual(result1.htmlCode, '<div>Hello</div>');
			assert.strictEqual(result2.htmlCode, '<div>Hello</div>');

			// Only 3 fetch calls (one set of HTML+CSS+JS), not 6
			assert.strictEqual(fetchCount, 3);

			mock.restoreAll();
		});

		it('clears in-flight entry after fetch completes', async () => {
			const store = new TemplateStore();
			const fetchMock = mock.fn(
				/** @param {string} url */
				(url) => {
					if (url.endsWith('.html')) {
						return Promise.resolve({
							status: 200,
							ok: true,
							text: () => Promise.resolve('<div>Hello</div>'),
							headers: new Map(),
						});
					}
					return Promise.resolve({ ok: false, headers: new Map() });
				},
			);
			globalThis.fetch = fetchMock;

			await store.requestTemplate('Test', './components');
			assert.strictEqual(store._inFlight.size, 0);

			mock.restoreAll();
		});

		it('clears in-flight entry even on fetch failure', async () => {
			const store = new TemplateStore();
			const fetchMock = mock.fn(() => {
				return Promise.resolve({
					status: 200,
					ok: true,
					text: () => Promise.resolve('<div>Hello</div>'),
					headers: new Map(),
				});
			});
			globalThis.fetch = fetchMock;

			// First request succeeds
			await store.requestTemplate('Test', './components');
			assert.strictEqual(store._inFlight.size, 0);

			mock.restoreAll();
		});

		it('clearAll clears in-flight map', () => {
			const store = new TemplateStore();
			store._inFlight.set('Test', Promise.resolve());
			store.clearAll();
			assert.strictEqual(store._inFlight.size, 0);
		});
	});
});
