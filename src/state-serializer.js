import { Component, Child } from './component.js';

/**
 * @typedef {import('./component.js').ComponentVars} ComponentVars
 */

/**
 * Check if a value is a serialized component reference marker.
 * @param {object|null} value - Value to check
 * @returns {boolean} True if value is a component ref marker
 */
function isComponentRef(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        /** @type {{_componentRef?: boolean}} */ (value)._componentRef === true
    );
}

/**
 * JSON replacer that converts Component and Child instances into
 * serializable markers. Called by JSON.stringify for every value
 * in the object tree.
 * @param {string} _key - Property key (unused)
 * @param {Component|Child|string|number|boolean|null|Array|object} value - Value to potentially replace
 * @returns {object|string|number|boolean|null|Array} Serializable value
 */
function componentReplacer(_key, value) {
    if (value instanceof Component) {
        return { _componentRef: true, name: value.componentName, id: value.componentId };
    }
    if (value instanceof Child) {
        return { _componentRef: true, name: value.componentName, id: value.componentId };
    }
    return value;
}

/**
 * State serializer for FuseWire component vars.
 *
 * Converts component vars to/from a string representation suitable for
 * storage (in-memory, IndexedDB, etc.). Handles Component and Child
 * references by converting them to serializable markers on stringify,
 * and restoring them as Child references on parse.
 *
 * The serialize/deserialize interface uses `stringify` and `parse` to
 * match the JSON global object's API shape.
 */
export class StateSerializer {
    /**
     * Serialize component vars to a JSON string.
     * Component and Child references are converted to serializable markers
     * using a JSON replacer function.
     * @param {ComponentVars} vars - Component vars to serialize
     * @returns {string} JSON string representation
     */
    stringify(vars) {
        return JSON.stringify(vars, componentReplacer);
    }

    /**
     * Deserialize a JSON string back to component vars.
     * Component reference markers are converted back to Child references
     * that the framework will mount normally during the render cycle.
     * @param {string} serialized - JSON string from stringify()
     * @returns {ComponentVars} Restored vars with Child references
     */
    parse(serialized) {
        if (!serialized) return {};
        return JSON.parse(serialized, (key, value) => {
            if (isComponentRef(value)) {
                return new Child(value.name, value.id, {});
            }
            return value;
        });
    }
}
