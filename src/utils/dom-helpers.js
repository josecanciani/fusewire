import { ComponentId } from '../component-id.js';

/**
 * Find all child component mount points within a container.
 * Returns mount points that have data-fusewire-parent-id matching the given parent ID.
 * @param {HTMLElement} container - Container element to search within
 * @param {ComponentId|string} parentComponentId - Parent component ID to match
 * @returns {HTMLElement[]} Array of mount point elements
 */
export function findChildMountPoints(container, parentComponentId) {
    const parentCode =
        typeof parentComponentId === 'string' ? parentComponentId : parentComponentId.code;

    // In attribute selectors with quoted values, special characters don't need escaping
    // Only escape the quote character itself and backslash
    const escapedParentId = parentCode.replace(/["\\]/g, '\\$&');
    const selector = `[data-fusewire-parent-id="${escapedParentId}"]`;
    const elements = container.querySelectorAll(selector);

    return /** @type {HTMLElement[]} */ (Array.from(elements));
}

/**
 * Create a mount point element for a component
 * @param {ComponentId|string} componentId - ComponentId instance or code string
 * @param {ComponentId|string} [parentComponentId] - Optional parent ComponentId instance or code string
 * @returns {HTMLElement} The mount point element
 */
export function createMountPoint(componentId, parentComponentId) {
    const el = document.createElement('fw-mount');

    // Accept either ComponentId instance or string
    const code = typeof componentId === 'string' ? componentId : componentId.code;

    el.setAttribute('data-fusewire-id', code);
    el.id = code;

    // Set parent ID if provided
    if (parentComponentId) {
        const parentCode =
            typeof parentComponentId === 'string' ? parentComponentId : parentComponentId.code;
        el.setAttribute('data-fusewire-parent-id', parentCode);
    }

    return el;
}

/**
 * Check if an element is a component mount point
 * @param {HTMLElement} element - DOM element to check
 * @returns {boolean} True if element is a mount point
 */
export function isMountPoint(element) {
    const id = element.getAttribute('data-fusewire-id');
    return id !== null && id !== '';
}

/**
 * Get the component ID from a mount point element
 * @param {HTMLElement} element - Mount point element
 * @returns {ComponentId|null} The component ID or null if invalid
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
