import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
	FuseWireError,
	ComponentNotFoundError,
	TemplateNotFoundError,
	RenderError,
} from '../../src/errors/error-hierarchy.js';

describe('Error Hierarchy', () => {
	describe('FuseWireError', () => {
		it('extends Error', () => {
			const error = new FuseWireError('test message');
			assert.ok(error instanceof Error);
		});

		it('sets message', () => {
			const error = new FuseWireError('test message');
			assert.strictEqual(error.message, 'test message');
		});

		it('sets default code', () => {
			const error = new FuseWireError('test');
			assert.strictEqual(error.code, 'FUSEWIRE_ERROR');
		});

		it('allows custom code', () => {
			const error = new FuseWireError('test', 'CUSTOM_CODE');
			assert.strictEqual(error.code, 'CUSTOM_CODE');
		});

		it('sets name to class name', () => {
			const error = new FuseWireError('test');
			assert.strictEqual(error.name, 'FuseWireError');
		});

		it('has stack trace', () => {
			const error = new FuseWireError('test');
			assert.ok(error.stack);
			assert.ok(error.stack.includes('FuseWireError'));
		});
	});

	describe('ComponentNotFoundError', () => {
		it('extends FuseWireError', () => {
			const error = new ComponentNotFoundError('UserList');
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});

		it('sets correct message', () => {
			const error = new ComponentNotFoundError('UserList');
			assert.strictEqual(error.message, 'Component not found: UserList');
		});

		it('sets correct code', () => {
			const error = new ComponentNotFoundError('UserList');
			assert.strictEqual(error.code, 'COMPONENT_NOT_FOUND');
		});

		it('stores component name', () => {
			const error = new ComponentNotFoundError('UserList');
			assert.strictEqual(error.componentName, 'UserList');
		});

		it('sets name to class name', () => {
			const error = new ComponentNotFoundError('UserList');
			assert.strictEqual(error.name, 'ComponentNotFoundError');
		});
	});

	describe('TemplateNotFoundError', () => {
		it('extends FuseWireError', () => {
			const error = new TemplateNotFoundError('UserList');
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});

		it('sets correct message', () => {
			const error = new TemplateNotFoundError('UserList');
			assert.strictEqual(
				error.message,
				'Template not found for component: UserList',
			);
		});

		it('sets correct code', () => {
			const error = new TemplateNotFoundError('UserList');
			assert.strictEqual(error.code, 'TEMPLATE_NOT_FOUND');
		});

		it('stores component name', () => {
			const error = new TemplateNotFoundError('UserList');
			assert.strictEqual(error.componentName, 'UserList');
		});

		it('sets name to class name', () => {
			const error = new TemplateNotFoundError('UserList');
			assert.strictEqual(error.name, 'TemplateNotFoundError');
		});
	});

	describe('RenderError', () => {
		it('extends FuseWireError', () => {
			const error = new RenderError('failed to render', 'UserList#main');
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});

		it('sets correct message', () => {
			const error = new RenderError('failed to render', 'UserList#main');
			assert.strictEqual(error.message, 'Render error: failed to render');
		});

		it('sets correct code', () => {
			const error = new RenderError('failed', 'UserList');
			assert.strictEqual(error.code, 'RENDER_ERROR');
		});

		it('stores component id', () => {
			const error = new RenderError('failed', 'UserList#main');
			assert.strictEqual(error.componentId, 'UserList#main');
		});

		it('sets name to class name', () => {
			const error = new RenderError('failed', 'UserList');
			assert.strictEqual(error.name, 'RenderError');
		});
	});

	describe('inheritance chain', () => {
		it('ComponentNotFoundError instanceof checks', () => {
			const error = new ComponentNotFoundError('Test');
			assert.ok(error instanceof ComponentNotFoundError);
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});

		it('TemplateNotFoundError instanceof checks', () => {
			const error = new TemplateNotFoundError('Test');
			assert.ok(error instanceof TemplateNotFoundError);
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});

		it('RenderError instanceof checks', () => {
			const error = new RenderError('msg', 'Test');
			assert.ok(error instanceof RenderError);
			assert.ok(error instanceof FuseWireError);
			assert.ok(error instanceof Error);
		});
	});
});
