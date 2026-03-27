/**
 * ComponentId - Represents a component's identity (name + optional instance id)
 *
 * Format: "ComponentName#instanceId" or "ComponentName" (if no instance id)
 *
 * Example:
 *   new ComponentId('UserList', 'main')  // UserList#main
 *   new ComponentId('Counter')           // Counter
 */
export class ComponentId {
  /**
   * Create a new ComponentId
   * @param {string} name - Component name (e.g., "Counter", "Basics/Counter")
   * @param {string} id - Optional instance identifier (e.g., "main", "sidebar", "")
   */
  constructor(name, id = '') {
    if (!name || typeof name !== 'string') {
      throw new Error('ComponentId: name must be a non-empty string');
    }

    this.name = name;
    this.id = id || '';
  }

  /**
   * Parse a component code string into a ComponentId
   * @param {string} code - Format: "Name#id" or "Name"
   * @returns {ComponentId}
   *
   * Examples:
   *   ComponentId.fromCode('UserList#main') → { name: 'UserList', id: 'main' }
   *   ComponentId.fromCode('Counter') → { name: 'Counter', id: '' }
   */
  static fromCode(code) {
    if (!code || typeof code !== 'string') {
      throw new Error('ComponentId.fromCode: code must be a non-empty string');
    }

    const hashIndex = code.indexOf('#');
    if (hashIndex === -1) {
      // No # found, entire string is the name
      return new ComponentId(code, '');
    }

    const name = code.substring(0, hashIndex);
    const id = code.substring(hashIndex + 1);

    return new ComponentId(name, id);
  }

  /**
   * Serialize this ComponentId to a code string
   * @returns {string} Format: "Name#id" or "Name"
   *
   * Examples:
   *   new ComponentId('UserList', 'main').toCode() → "UserList#main"
   *   new ComponentId('Counter').toCode() → "Counter"
   */
  toCode() {
    return this.id ? `${this.name}#${this.id}` : this.name;
  }

  /**
   * Check equality with another ComponentId
   * @param {ComponentId} other - ComponentId to compare with
   * @returns {boolean} True if name and id match
   */
  equals(other) {
    if (!other || !(other instanceof ComponentId)) {
      return false;
    }
    return this.name === other.name && this.id === other.id;
  }

  /**
   * String representation (for debugging)
   * @returns {string} Component code string
   */
  toString() {
    return this.toCode();
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
