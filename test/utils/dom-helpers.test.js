import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { ComponentId } from '../../src/component-id.js';
import {
	findChildMountPoints,
	createMountPoint,
	isMountPoint,
	getComponentIdFromElement,
} from '../../src/utils/dom-helpers.js';

// Set up JSDOM global document
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLDivElement = dom.window.HTMLDivElement;

describe('DOM Helpers', () => {
	describe('createMountPoint', () => {
		it('creates div element', () => {
			const div = createMountPoint('UserList#main');
			assert.strictEqual(div.tagName, 'DIV');
		});

		it('sets data-fusewire-id attribute from string', () => {
			const div = createMountPoint('UserList#main');
			assert.strictEqual(div.getAttribute('data-fusewire-id'), 'UserList#main');
		});

		it('sets data-fusewire-id attribute from ComponentId', () => {
			const componentId = new ComponentId('UserList', 'main');
			const div = createMountPoint(componentId);
			assert.strictEqual(div.getAttribute('data-fusewire-id'), 'UserList#main');
		});

		it('handles component without id', () => {
			const div = createMountPoint('Counter');
			assert.strictEqual(div.getAttribute('data-fusewire-id'), 'Counter');
		});

		it('sets data-fusewire-parent-id from string', () => {
			const div = createMountPoint('UserList#main', 'Dashboard#10');
			assert.strictEqual(
				div.getAttribute('data-fusewire-parent-id'),
				'Dashboard#10',
			);
		});

		it('sets data-fusewire-parent-id from ComponentId', () => {
			const childId = new ComponentId('UserList', 'main');
			const parentId = new ComponentId('Dashboard', '10');
			const div = createMountPoint(childId, parentId);
			assert.strictEqual(
				div.getAttribute('data-fusewire-parent-id'),
				'Dashboard#10',
			);
		});

		it('does not set data-fusewire-parent-id when not provided', () => {
			const div = createMountPoint('UserList#main');
			assert.strictEqual(div.getAttribute('data-fusewire-parent-id'), null);
		});
	});

	describe('isMountPoint', () => {
		it('returns true for element with data-fusewire-id', () => {
			const div = document.createElement('div');
			div.setAttribute('data-fusewire-id', 'UserList#main');
			assert.strictEqual(isMountPoint(div), true);
		});

		it('returns false for element without data-fusewire-id', () => {
			const div = document.createElement('div');
			assert.strictEqual(isMountPoint(div), false);
		});

		it('returns false for null', () => {
			assert.strictEqual(isMountPoint(null), false);
		});

		it('returns false for non-element', () => {
			assert.strictEqual(isMountPoint({}), false);
		});
	});

	describe('getComponentIdFromElement', () => {
		it('extracts ComponentId from mount point', () => {
			const div = document.createElement('div');
			div.setAttribute('data-fusewire-id', 'UserList#main');

			const componentId = getComponentIdFromElement(div);
			assert.ok(componentId instanceof ComponentId);
			assert.strictEqual(componentId.name, 'UserList');
			assert.strictEqual(componentId.id, 'main');
		});

		it('handles component without id', () => {
			const div = document.createElement('div');
			div.setAttribute('data-fusewire-id', 'Counter');

			const componentId = getComponentIdFromElement(div);
			assert.strictEqual(componentId.name, 'Counter');
			assert.strictEqual(componentId.id, '');
		});

		it('returns null for non-mount-point', () => {
			const div = document.createElement('div');
			const componentId = getComponentIdFromElement(div);
			assert.strictEqual(componentId, null);
		});

		it('returns null for invalid component id format', () => {
			const div = document.createElement('div');
			div.setAttribute('data-fusewire-id', ''); // Empty string

			const componentId = getComponentIdFromElement(div);
			assert.strictEqual(componentId, null);
		});

		it('returns null for null element', () => {
			const componentId = getComponentIdFromElement(null);
			assert.strictEqual(componentId, null);
		});
	});

	describe('findChildMountPoints', () => {
		it('finds single direct child mount point', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML =
				'<div data-fusewire-id="UserList#main" data-fusewire-parent-id="Dashboard#10"></div>';

			const mountPoints = findChildMountPoints(container);
			assert.strictEqual(mountPoints.length, 1);
			assert.strictEqual(mountPoints[0].componentId.name, 'UserList');
			assert.strictEqual(mountPoints[0].componentId.id, 'main');
		});

		it('finds multiple direct child mount points', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML = `
        <div data-fusewire-id="UserList#main" data-fusewire-parent-id="Dashboard#10"></div>
        <div data-fusewire-id="Counter" data-fusewire-parent-id="Dashboard#10"></div>
        <div data-fusewire-id="Widget#sidebar" data-fusewire-parent-id="Dashboard#10"></div>
      `;

			const mountPoints = findChildMountPoints(container);
			assert.strictEqual(mountPoints.length, 3);
			assert.strictEqual(mountPoints[0].componentId.name, 'UserList');
			assert.strictEqual(mountPoints[1].componentId.name, 'Counter');
			assert.strictEqual(mountPoints[2].componentId.name, 'Widget');
		});

		it('excludes nested mount points (only direct children)', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML = `
        <div data-fusewire-id="Widget#w1" data-fusewire-parent-id="Dashboard#10">
          <div data-fusewire-id="Button#b1" data-fusewire-parent-id="Widget#w1"></div>
        </div>
        <div data-fusewire-id="Widget#w2" data-fusewire-parent-id="Dashboard#10"></div>
      `;

			const mountPoints = findChildMountPoints(container);
			// Should only find Widget#w1 and Widget#w2, not Button#b1
			assert.strictEqual(mountPoints.length, 2);
			assert.strictEqual(mountPoints[0].componentId.name, 'Widget');
			assert.strictEqual(mountPoints[0].componentId.id, 'w1');
			assert.strictEqual(mountPoints[1].componentId.name, 'Widget');
			assert.strictEqual(mountPoints[1].componentId.id, 'w2');
		});

		it('returns empty array for container with no child mount points', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML = '<div>No mount points</div>';

			const mountPoints = findChildMountPoints(container);
			assert.deepStrictEqual(mountPoints, []);
		});

		it('returns empty array for empty container', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			const mountPoints = findChildMountPoints(container);
			assert.deepStrictEqual(mountPoints, []);
		});

		it('returns empty array for non-mount-point container', () => {
			const container = document.createElement('div');
			const mountPoints = findChildMountPoints(container);
			assert.deepStrictEqual(mountPoints, []);
		});

		it('returns empty array for null container', () => {
			const mountPoints = findChildMountPoints(null);
			assert.deepStrictEqual(mountPoints, []);
		});

		it('skips mount points with wrong parent id', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML = `
        <div data-fusewire-id="ValidChild" data-fusewire-parent-id="Dashboard#10"></div>
        <div data-fusewire-id="WrongParent" data-fusewire-parent-id="OtherDashboard#20"></div>
        <div data-fusewire-id="NoParent"></div>
      `;

			const mountPoints = findChildMountPoints(container);
			// Should only find the one with matching parent ID
			assert.strictEqual(mountPoints.length, 1);
			assert.strictEqual(mountPoints[0].componentId.name, 'ValidChild');
		});

		it('returns element references', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#10');
			container.innerHTML =
				'<div data-fusewire-id="Test" data-fusewire-parent-id="Dashboard#10"></div>';

			const mountPoints = findChildMountPoints(container);
			assert.ok(mountPoints[0].element instanceof global.HTMLElement);
			assert.strictEqual(
				mountPoints[0].element.getAttribute('data-fusewire-id'),
				'Test',
			);
		});

		it('handles special characters in parent id', () => {
			const container = document.createElement('div');
			container.setAttribute('data-fusewire-id', 'Dashboard#id-with-"quotes"');
			container.innerHTML =
				'<div data-fusewire-id="Child" data-fusewire-parent-id="Dashboard#id-with-&quot;quotes&quot;"></div>';

			const mountPoints = findChildMountPoints(container);
			assert.strictEqual(mountPoints.length, 1);
			assert.strictEqual(mountPoints[0].componentId.name, 'Child');
		});
	});
});
