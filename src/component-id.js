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
 *   new ComponentId('UserList', 'main')           // code → "UserList#main", version → ''
 *   new ComponentId('Counter', '', 'a1b2c3d4e5f6') // code → "Counter", version → 'a1b2c3d4e5f6'
 */
export class ComponentId {
  /**
   * Create a new ComponentId
   * @param {string} name - Component name (e.g., "Counter", "Basics/Counter")
   * @param {string} id - Optional instance identifier (e.g., "main", "sidebar", "")
   * @param {string} version - Content hash of the component's files (default empty)
   */
  constructor(name, id = '', version = '') {
    if (!name || typeof name !== 'string') {
      throw new Error('ComponentId: name must be a non-empty string');
    }

    this._name = name;
    this._id = id || '';
    this._version = version || '';
  }

  /**
   * Component name (class/template name, e.g. "Counter", "Table/Person")
   * @returns {string} The component name
   */
  get name() {
    return this._name;
  }

  /**
   * Instance identifier within the component name (e.g. "main", "1234")
   * @returns {string} The instance identifier
   */
  get id() {
    return this._id;
  }

  /**
   * Content hash of the component's HTML + CSS + JS files
   * @returns {string} The version hash or empty string if not yet known
   */
  get version() {
    return this._version;
  }

  /**
   * Full component code — unique reference within the application.
   * Format: "Name#id" when id is present, "Name" otherwise.
   * @returns {string} The component code string
   */
  get code() {
    return this._id ? `${this._name}#${this._id}` : this._name;
  }

  /**
   * Parse a component code string into a ComponentId
   * @param {string} code - Format: "Name#id" or "Name"
   * @returns {ComponentId} Parsed ComponentId instance
   *
   * @example
   *   ComponentId.fromCode('UserList#main') // → { name: 'UserList', id: 'main' }
   *   ComponentId.fromCode('Counter')       // → { name: 'Counter', id: '' }
   */
  static fromCode(code) {
    if (!code || typeof code !== 'string') {
      throw new Error('ComponentId.fromCode: code must be a non-empty string');
    }

    const hashIndex = code.indexOf('#');
    if (hashIndex === -1) {
      return new ComponentId(code, '');
    }

    const name = code.substring(0, hashIndex);
    const id = code.substring(hashIndex + 1);

    return new ComponentId(name, id);
  }

  /**
   * Check equality with another ComponentId (compares name and id, not version)
   * @param {ComponentId} other - ComponentId to compare with
   * @returns {boolean} True if name and id match
   */
  equals(other) {
    if (!other || !(other instanceof ComponentId)) {
      return false;
    }
    return this._name === other._name && this._id === other._id;
  }

  /**
   * String representation (returns the component code)
   * @returns {string} Component code string
   */
  toString() {
    return this.code;
  }
}

/**
 * Convert a component name to a CSS-safe identifier.
 * Replaces '/' (used in directory-based names like 'Basics/Counter') with '_'.
 * @param {string} name - Component name
 * @returns {string} CSS-safe name
 */
export function toCssName(name) {
  return name.replaceAll('/', '_');
}
