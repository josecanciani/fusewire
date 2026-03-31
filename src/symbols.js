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

/** @type {symbol} Component identity (ComponentId object) */
export const COMPONENT_ID = Symbol('componentId');

/** @type {symbol} Shared registry entry ({ instance, container, parent, children }) */
export const REGISTRY_ENTRY = Symbol('registryEntry');

/** @type {symbol} Pre-built console wrapper with component context */
export const CONSOLE = Symbol('console');

/** @type {symbol} Reactor reference (enables react(), console, etc.) */
export const REACTOR = Symbol('reactor');

/** @type {symbol} Name of the active lifecycle hook, or null (guards react() during hooks) */
export const LIFECYCLE_ACTIVE = Symbol('lifecycleActive');

/** @type {symbol} Event handlers map for pub/sub (Map<string, Set<function>>) — cleared by InstanceRegistry on destroy */
export const EVENTS = Symbol('events');

/** @type {symbol} Library loading state — Map<string, {promise, exportNames, module}> */
export const LIBRARIES = Symbol('libraries');
