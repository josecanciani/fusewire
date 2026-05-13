/**
 * Framework-internal Symbols for Component instance state.
 *
 * DO NOT import these in application components. These Symbols are reserved
 * for the FuseWire engine (InstanceRegistry, Reactor, Component base class).
 */

/**
 * Unique component identifier (ComponentId object).
 * @type {symbol}
 */
export const COMPONENT_ID = Symbol.for('fusewire.componentId');

/**
 * Shared registry entry ({ instance, container, parent, children, needsHydration }).
 * @typedef RegistryEntry
 * @property {import('./component.js').Component} instance
 * @property {HTMLElement} container
 * @property {import('./component-id.js').ComponentId|null} parent
 * @property {Map<string, import('./component-id.js').ComponentId>} children
 * @property {boolean} needsHydration
 */

/**
 * Shared registry entry ({ instance, container, parent, children, needsHydration }).
 * @type {symbol}
 */
export const REGISTRY_ENTRY = Symbol.for('fusewire.registryEntry');

/**
 * Pre-built console wrapper with component context.
 * @type {symbol}
 */
export const CONSOLE = Symbol.for('fusewire.console');

/**
 * Reactor reference (enables react(), broadcast(), etc.).
 * @type {symbol}
 */
export const REACTOR = Symbol.for('fusewire.reactor');

/**
 * Name of the active lifecycle hook ('init', 'render', 'hydrate', 'afterRender', 'update').
 * @type {symbol}
 */
export const LIFECYCLE_ACTIVE = Symbol.for('fusewire.lifecycleActive');

/**
 * Event emitter for component-local events.
 * @type {symbol}
 */
export const EVENTS = Symbol.for('fusewire.events');

/**
 * Library loading state — Map of library name to {promise, module}.
 * @type {symbol}
 */
export const LIBRARIES = Symbol.for('fusewire.libraries');

/**
 * Snapshot of routeState() defaults captured before init().
 * @type {symbol}
 */
export const ROUTE_DEFAULTS = Symbol.for('fusewire.routeDefaults');

/**
 * Marker Symbol for identifying Component instances.
 * @type {symbol}
 */
export const IS_COMPONENT = Symbol.for('fusewire.isComponent');

/**
 * Marker Symbol for identifying Child references.
 * @type {symbol}
 */
export const IS_CHILD = Symbol.for('fusewire.isChild');
