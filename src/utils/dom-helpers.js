import { ComponentId } from '../component-id.js';

/**
 * Find all child component mount points within a container.
 * Returns mount points that have data-fusewire-parent-id matching the given parent ID.
 * @param {HTMLElement} container - Container element to search within
 * @param {ComponentId|string} parentComponentId - Parent component ID to match
 * @returns {HTMLElement[]} Array of mount point elements
 */
export function findChildMountPoints(container, parentComponentId) {
  if (!container) {
    return [];
  }

  const parentCode =
    typeof parentComponentId === 'string' ? parentComponentId : parentComponentId.toCode();

  // In attribute selectors with quoted values, special characters don't need escaping
  // Only escape the quote character itself and backslash
  const escapedParentId = parentCode.replace(/["\\]/g, '\\$&');
  const selector = `[data-fusewire-parent-id="${escapedParentId}"]`;
  const elements = container.querySelectorAll(selector);

  return Array.from(elements);
}

/**
 * Create a mount point element for a component
 * @param {ComponentId|string} componentId - ComponentId instance or code string
 * @param {ComponentId|string} [parentComponentId] - Optional parent ComponentId instance or code string
 * @returns {HTMLDivElement} The mount point div element
 */
export function createMountPoint(componentId, parentComponentId) {
  const div = document.createElement('div');

  // Accept either ComponentId instance or string
  const code = typeof componentId === 'string' ? componentId : componentId.toCode();

  div.setAttribute('data-fusewire-id', code);

  // Set parent ID if provided
  if (parentComponentId) {
    const parentCode =
      typeof parentComponentId === 'string' ? parentComponentId : parentComponentId.toCode();
    div.setAttribute('data-fusewire-parent-id', parentCode);
  }

  return div;
}

/**
 * Check if an element is a component mount point
 * @param {HTMLElement} element - DOM element to check
 * @returns {boolean} True if element is a mount point
 */
export function isMountPoint(element) {
  if (!element || !element.hasAttribute) {
    return false;
  }
  return element.hasAttribute('data-fusewire-id');
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
