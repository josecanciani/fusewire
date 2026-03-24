import { ComponentId } from '../component-id.js';

/**
 * Escape a string for use in CSS selector
 * @param {string} str
 * @returns {string}
 */
function escapeCssSelector(str) {
	// Replace special characters that need escaping in CSS selectors
	return str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}

/**
 * Find all direct child component mount points within a container.
 * Only returns mount points that have data-fusewire-parent-id matching the container's ID.
 * @param {HTMLElement} container - Container element (must be a mount point)
 * @returns {Array<{element: HTMLElement, componentId: ComponentId}>}
 */
export function findChildMountPoints(container) {
	if (!isMountPoint(container)) {
		return [];
	}

	const parentId = container.getAttribute('data-fusewire-id');
	const escapedParentId = escapeCssSelector(parentId);
	const selector = `[data-fusewire-parent-id="${escapedParentId}"]`;
	const elements = container.querySelectorAll(selector);
	const mountPoints = [];

	for (const element of elements) {
		const componentId = getComponentIdFromElement(element);
		if (componentId) {
			mountPoints.push({ element, componentId });
		}
	}

	return mountPoints;
}

/**
 * Create a mount point element for a component
 * @param {ComponentId|string} componentId - ComponentId instance or code string
 * @param {ComponentId|string} [parentComponentId] - Optional parent ComponentId instance or code string
 * @returns {HTMLDivElement}
 */
export function createMountPoint(componentId, parentComponentId) {
	const div = document.createElement('div');

	// Accept either ComponentId instance or string
	const code =
		typeof componentId === 'string'
			? componentId
			: componentId.toCode();

	div.setAttribute('data-fusewire-id', code);

	// Set parent ID if provided
	if (parentComponentId) {
		const parentCode =
			typeof parentComponentId === 'string'
				? parentComponentId
				: parentComponentId.toCode();
		div.setAttribute('data-fusewire-parent-id', parentCode);
	}

	return div;
}

/**
 * Check if an element is a component mount point
 * @param {HTMLElement} element
 * @returns {boolean}
 */
export function isMountPoint(element) {
	if (!element || !element.hasAttribute) {
		return false;
	}
	return element.hasAttribute('data-fusewire-id');
}

/**
 * Get the component ID from a mount point element
 * @param {HTMLElement} element
 * @returns {ComponentId|null}
 */
export function getComponentIdFromElement(element) {
	if (!isMountPoint(element)) {
		return null;
	}

	const code = element.getAttribute('data-fusewire-id');
	try {
		return ComponentId.fromCode(code);
	} catch (error) {
		console.warn(`Invalid data-fusewire-id on element: ${code}`, error);
		return null;
	}
}
