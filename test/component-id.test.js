import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createComponentId, componentIdFromCode, componentIdsEqual } from '../src/component-id.js';

describe('ComponentId', () => {
	describe('constructor', () => {
		it('creates ComponentId with name only', () => {
			const cid = createComponentId('UserList');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, '');
			assert.strictEqual(cid.version, '');
		});

		it('creates ComponentId with name and id', () => {
			const cid = createComponentId('UserList', 'main');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
			assert.strictEqual(cid.version, '');
		});

		it('creates ComponentId with name, id and version', () => {
			const cid = createComponentId('UserList', 'main', 'a1b2c3');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
			assert.strictEqual(cid.version, 'a1b2c3');
		});

		it('creates ComponentId with version but no id', () => {
			const cid = createComponentId('Counter', '', 'abc123');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
			assert.strictEqual(cid.version, 'abc123');
		});

		it('treats empty string id as no id', () => {
			const cid = createComponentId('Counter', '');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
		});

		it('throws if name is empty', () => {
			assert.throws(
				() => createComponentId(''),
				/name must be a non-empty string/,
			);
		});

		it('throws if name is not a string', () => {
			assert.throws(
				() => createComponentId(null),
				/name must be a non-empty string/,
			);
		});
	});

	describe('fromCode', () => {
		it('parses code with id', () => {
			const cid = componentIdFromCode('UserList#main');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
		});

		it('parses code without id', () => {
			const cid = componentIdFromCode('Counter');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
		});

		it('handles underscore in component name', () => {
			const cid = componentIdFromCode('Dashlet_ServerTime');
			assert.strictEqual(cid.name, 'Dashlet_ServerTime');
			assert.strictEqual(cid.id, '');
		});

		it('handles numeric id', () => {
			const cid = componentIdFromCode('TableRow#42');
			assert.strictEqual(cid.name, 'TableRow');
			assert.strictEqual(cid.id, '42');
		});

		it('handles slash in component name (directory-based)', () => {
			const cid = componentIdFromCode('Basics/Counter#main');
			assert.strictEqual(cid.name, 'Basics/Counter');
			assert.strictEqual(cid.id, 'main');
		});

		it('handles multiple # characters (takes first as delimiter)', () => {
			const cid = componentIdFromCode('Component#id#extra');
			assert.strictEqual(cid.name, 'Component');
			assert.strictEqual(cid.id, 'id#extra');
		});

		it('throws if code is empty', () => {
			assert.throws(
				() => componentIdFromCode(''),
				/code must be a non-empty string/,
			);
		});

		it('throws if code is not a string', () => {
			assert.throws(
				() => componentIdFromCode(null),
				/code must be a non-empty string/,
			);
		});
	});

	describe('code', () => {
		it('serializes with id', () => {
			const cid = createComponentId('UserList', 'main');
			assert.strictEqual(cid.code, 'UserList#main');
		});

		it('serializes without id', () => {
			const cid = createComponentId('Counter');
			assert.strictEqual(cid.code, 'Counter');
		});

		it('round-trip with id', () => {
			const original = 'Dashlet_ServerTime#sidebar';
			const cid = componentIdFromCode(original);
			assert.strictEqual(cid.code, original);
		});

		it('round-trip without id', () => {
			const original = 'Index';
			const cid = componentIdFromCode(original);
			assert.strictEqual(cid.code, original);
		});
	});

	describe('equals', () => {
		it('returns true for identical ComponentIds', () => {
			const cid1 = createComponentId('UserList', 'main');
			const cid2 = createComponentId('UserList', 'main');
			assert.strictEqual(componentIdsEqual(cid1, cid2), true);
		});

		it('returns true for ComponentIds with no id', () => {
			const cid1 = createComponentId('Counter');
			const cid2 = createComponentId('Counter', '');
			assert.strictEqual(componentIdsEqual(cid1, cid2), true);
		});

		it('returns true when only version differs', () => {
			const cid1 = createComponentId('Counter', 'main', 'v1');
			const cid2 = createComponentId('Counter', 'main', 'v2');
			assert.strictEqual(componentIdsEqual(cid1, cid2), true);
		});

		it('returns false for different names', () => {
			const cid1 = createComponentId('UserList', 'main');
			const cid2 = createComponentId('Counter', 'main');
			assert.strictEqual(componentIdsEqual(cid1, cid2), false);
		});

		it('returns false for different ids', () => {
			const cid1 = createComponentId('UserList', 'main');
			const cid2 = createComponentId('UserList', 'sidebar');
			assert.strictEqual(componentIdsEqual(cid1, cid2), false);
		});

		it('returns false for null', () => {
			const cid = createComponentId('UserList', 'main');
			assert.strictEqual(componentIdsEqual(cid, null), false);
		});

		it('returns true for matching plain object (duck typing)', () => {
			const cid = createComponentId('UserList', 'main');
			assert.strictEqual(componentIdsEqual(cid, { name: 'UserList', id: 'main' }), true);
		});
	});

	describe('toString', () => {
		it('returns code string', () => {
			const cid = createComponentId('UserList', 'main');
			assert.strictEqual(cid.toString(), 'UserList#main');
		});
	});
});
