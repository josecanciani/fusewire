/**
 * Framework-internal Symbols for Component instance state.
 *
 * DO NOT import these in application components. These Symbols are reserved
 * for the FuseWire engine (InstanceRegistry, Reactor, Component base class).
 *
 * The only acceptable use outside the engine is privileged tooling that needs
 * direct access to framework internals (e.g., a live component editor).
 *
 * Using Symbol-keyed properties ensures:
 *   - Object.keys() never returns framework state (only component vars)
 *   - Developers cannot accidentally collide with framework properties
 *   - collectVars() needs no filtering — only string keys are component vars
 */

/**
 * Component identity (ComponentId object)
 * @type {symbol}
 */
export const COMPONENT_ID = Symbol('componentId');

/**
 * Shared registry entry ({ instance, container, parent, children })
 * @type {symbol}
 */
export const REGISTRY_ENTRY = Symbol('registryEntry');

/**
 * Pre-built console wrapper with component context
 * @type {symbol}
 */
export const CONSOLE = Symbol('console');

/**
 * Reactor reference (enables react(), console, etc.)
 * @type {symbol}
 */
export const REACTOR = Symbol('reactor');

/**
 * Name of the active lifecycle hook, or null (guards react() during hooks)
 * @type {symbol}
 */
export const LIFECYCLE_ACTIVE = Symbol('lifecycleActive');

/**
 * Event handlers map for pub/sub (Map<string, Set<function>>) — cleared by InstanceRegistry on destroy
 * @type {symbol}
 */
export const EVENTS = Symbol('events');

/**
 * Library loading state — Map<string, {promise, exportNames, module}>
 * @type {symbol}
 */
export const LIBRARIES = Symbol('libraries');

/**
 * Snapshot of routeState() defaults captured before init() — used by the router to omit unchanged values from the URL
 * @type {symbol}
 */
export const ROUTE_DEFAULTS = Symbol('routeDefaults');
