/**
 * ComponentId - Represents a component's identity (name + optional instance id + version).
 *
 * Immutable after construction. When a component's template version changes,
 * the framework creates a new ComponentId (and a new Component instance)
 * rather than mutating the existing one.
 *
 * Terminology:
 *   - **name**    The class/template name (e.g. "Table/Person")
 *   - **id**      A unique instance identifier within that name (e.g. "1234")
 *   - **code**    The full unique reference: "Table/Person#1234"
 *   - **version** Content hash of the component's HTML + CSS + JS files
 *
 * @example
 *   createComponentId('UserList', 'main')           // code → "UserList#main", version → ''
 *   createComponentId('Counter', '', 'a1b2c3d4e5f6') // code → "Counter", version → 'a1b2c3d4e5f6'
 */

/**
 * Component identifier object
 * @typedef ComponentId
 * @property {string} name - Component name (class/template name, e.g. "Counter", "Table/Person")
 * @property {string} id - Instance identifier within the component name (e.g. "main", "1234")
 * @property {string} version - Content hash of the component's HTML + CSS + JS files
 * @property {string} code - The full component code (Name#id)
 * @property {function(): string} toString - Convert to string
 * @property {string} code - Full component code — unique reference within the application. Format: "Name#id" when id is present, "Name" otherwise.
 */

/**
 * Create a new ComponentId
 * @param {string} name - Component name (e.g., "Counter", "Basics/Counter")
 * @param {string} id - Optional instance identifier (e.g., "main", "sidebar", "")
 * @param {string} version - Content hash of the component's files (default empty)
 * @returns {ComponentId} The ComponentId object
 */
export function createComponentId(name, id = '', version = '') {
    if (!name || typeof name !== 'string') {
        throw new Error('ComponentId: name must be a non-empty string');
    }

    const _name = name;
    const _id = id || '';

    return {
        name: _name,
        id: _id,
        version: version || '',
        /**
         * Get the full component code (Name#id)
         * @returns {string} The component code
         */
        get code() {
            return _id ? `${_name}#${_id}` : _name;
        },
        /**
         * Convert to string
         * @returns {string} The component code
         */
        toString() {
            return this.code;
        },
    };
}

/**
 * Parse a component code string into a ComponentId
 * @param {string} code - Format: "Name#id" or "Name"
 * @returns {ComponentId} Parsed ComponentId instance
 *
 * @example
 *   componentIdFromCode('UserList#main') // → { name: 'UserList', id: 'main' }
 *   componentIdFromCode('Counter')       // → { name: 'Counter', id: '' }
 */
export function componentIdFromCode(code) {
    if (!code || typeof code !== 'string') {
        throw new Error('ComponentId.fromCode: code must be a non-empty string');
    }

    const hashIndex = code.indexOf('#');
    if (hashIndex === -1) {
        return createComponentId(code, '');
    }

    const name = code.substring(0, hashIndex);
    const id = code.substring(hashIndex + 1);

    return createComponentId(name, id);
}

/**
 * Check equality with another ComponentId (compares name and id, not version)
 * @param {ComponentId} a - First ComponentId
 * @param {ComponentId} b - Second ComponentId
 * @returns {boolean} True if name and id match
 */
export function componentIdsEqual(a, b) {
    if (!a || !b) {
        return false;
    }
    return a.name === b.name && a.id === b.id;
}
