import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ComponentId, toCssName } from '../src/component-id.js';

describe('ComponentId', () => {
	describe('constructor', () => {
		it('creates ComponentId with name only', () => {
			const cid = new ComponentId('UserList');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, '');
			assert.strictEqual(cid.version, '');
		});

		it('creates ComponentId with name and id', () => {
			const cid = new ComponentId('UserList', 'main');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
			assert.strictEqual(cid.version, '');
		});

		it('creates ComponentId with name, id and version', () => {
			const cid = new ComponentId('UserList', 'main', 'a1b2c3');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
			assert.strictEqual(cid.version, 'a1b2c3');
		});

		it('creates ComponentId with version but no id', () => {
			const cid = new ComponentId('Counter', '', 'abc123');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
			assert.strictEqual(cid.version, 'abc123');
		});

		it('treats empty string id as no id', () => {
			const cid = new ComponentId('Counter', '');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
		});

		it('throws if name is empty', () => {
			assert.throws(
				() => new ComponentId(''),
				/name must be a non-empty string/,
			);
		});

		it('throws if name is not a string', () => {
			assert.throws(
				() => new ComponentId(null),
				/name must be a non-empty string/,
			);
		});
	});

	describe('fromCode', () => {
		it('parses code with id', () => {
			const cid = ComponentId.fromCode('UserList#main');
			assert.strictEqual(cid.name, 'UserList');
			assert.strictEqual(cid.id, 'main');
		});

		it('parses code without id', () => {
			const cid = ComponentId.fromCode('Counter');
			assert.strictEqual(cid.name, 'Counter');
			assert.strictEqual(cid.id, '');
		});

		it('handles underscore in component name', () => {
			const cid = ComponentId.fromCode('Dashlet_ServerTime');
			assert.strictEqual(cid.name, 'Dashlet_ServerTime');
			assert.strictEqual(cid.id, '');
		});

		it('handles numeric id', () => {
			const cid = ComponentId.fromCode('TableRow#42');
			assert.strictEqual(cid.name, 'TableRow');
			assert.strictEqual(cid.id, '42');
		});

		it('handles slash in component name (directory-based)', () => {
			const cid = ComponentId.fromCode('Basics/Counter#main');
			assert.strictEqual(cid.name, 'Basics/Counter');
			assert.strictEqual(cid.id, 'main');
		});

		it('handles multiple # characters (takes first as delimiter)', () => {
			const cid = ComponentId.fromCode('Component#id#extra');
			assert.strictEqual(cid.name, 'Component');
			assert.strictEqual(cid.id, 'id#extra');
		});

		it('throws if code is empty', () => {
			assert.throws(
				() => ComponentId.fromCode(''),
				/code must be a non-empty string/,
			);
		});

		it('throws if code is not a string', () => {
			assert.throws(
				() => ComponentId.fromCode(null),
				/code must be a non-empty string/,
			);
		});
	});

	describe('code', () => {
		it('serializes with id', () => {
			const cid = new ComponentId('UserList', 'main');
			assert.strictEqual(cid.code, 'UserList#main');
		});

		it('serializes without id', () => {
			const cid = new ComponentId('Counter');
			assert.strictEqual(cid.code, 'Counter');
		});

		it('round-trip with id', () => {
			const original = 'Dashlet_ServerTime#sidebar';
			const cid = ComponentId.fromCode(original);
			assert.strictEqual(cid.code, original);
		});

		it('round-trip without id', () => {
			const original = 'Index';
			const cid = ComponentId.fromCode(original);
			assert.strictEqual(cid.code, original);
		});
	});

	describe('equals', () => {
		it('returns true for identical ComponentIds', () => {
			const cid1 = new ComponentId('UserList', 'main');
			const cid2 = new ComponentId('UserList', 'main');
			assert.strictEqual(cid1.equals(cid2), true);
		});

		it('returns true for ComponentIds with no id', () => {
			const cid1 = new ComponentId('Counter');
			const cid2 = new ComponentId('Counter', '');
			assert.strictEqual(cid1.equals(cid2), true);
		});

		it('returns true when only version differs', () => {
			const cid1 = new ComponentId('Counter', 'main', 'v1');
			const cid2 = new ComponentId('Counter', 'main', 'v2');
			assert.strictEqual(cid1.equals(cid2), true);
		});

		it('returns false for different names', () => {
			const cid1 = new ComponentId('UserList', 'main');
			const cid2 = new ComponentId('Counter', 'main');
			assert.strictEqual(cid1.equals(cid2), false);
		});

		it('returns false for different ids', () => {
			const cid1 = new ComponentId('UserList', 'main');
			const cid2 = new ComponentId('UserList', 'sidebar');
			assert.strictEqual(cid1.equals(cid2), false);
		});

		it('returns false for null', () => {
			const cid = new ComponentId('UserList', 'main');
			assert.strictEqual(cid.equals(null), false);
		});

		it('returns false for non-ComponentId', () => {
			const cid = new ComponentId('UserList', 'main');
			assert.strictEqual(cid.equals({ name: 'UserList', id: 'main' }), false);
		});
	});

	describe('toString', () => {
		it('returns code string', () => {
			const cid = new ComponentId('UserList', 'main');
			assert.strictEqual(cid.toString(), 'UserList#main');
		});
	});
});

describe('toCssName', () => {
	it('returns name unchanged when no slashes', () => {
		assert.strictEqual(toCssName('Counter'), 'Counter');
	});

	it('replaces single slash with underscore', () => {
		assert.strictEqual(toCssName('Basics/Counter'), 'Basics_Counter');
	});

	it('replaces multiple slashes', () => {
		assert.strictEqual(toCssName('Dashlet/Charts/LineChart'), 'Dashlet_Charts_LineChart');
	});
});
