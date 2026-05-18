import { EVENTS } from './symbols.js';
import { PortalHost } from './builtins/portal-host.js';
import { PortalChild } from './builtins/portal-child.js';
import { emitBroadcast } from './event-emitter.js';

/**
 * Broadcast an event top-down through the component tree starting from root(s).
 * @param {import('./instance.js').InstanceRegistry} registry - The instance registry
 * @param {string} eventName - Event name to broadcast
 * @param {Array.<*>} args - Arguments forwarded to each handler
 */
export function broadcastFromRoots(registry, eventName, args) {
    for (const rootEntry of registry.rootEntries) {
        _broadcastToEntry(registry, rootEntry, eventName, args);
    }
}

/**
 * Broadcast an event top-down starting from a specific component and its children.
 * @param {import('./instance.js').InstanceRegistry} registry - The instance registry
 * @param {import('./component-id.js').ComponentId} componentId - Component to broadcast from
 * @param {string} eventName - Event name to broadcast
 * @param {Array.<*>} args - Arguments forwarded to each handler
 */
export function broadcastFrom(registry, componentId, eventName, args) {
    const entry = registry.getEntry(componentId.code);
    if (entry) {
        _broadcastToEntry(registry, entry, eventName, args);
    }
}

/**
 * Recursively broadcast an event to a single registry entry and its children.
 * If any handler on the entry returns false, propagation stops for that subtree.
 * @param {import('./instance.js').InstanceRegistry} registry - The instance registry
 * @param {import('./symbols.js').RegistryEntry} entry - Registry entry
 * @param {string} eventName - Event name to broadcast
 * @param {Array.<*>} args - Arguments forwarded to each handler
 */
function _broadcastToEntry(registry, entry, eventName, args) {
    const { instance } = entry;

    // PortalHost subtrees are excluded — broadcasts reach portal children
    // only via PortalChild forwarding to prevent double-delivery
    if (PortalHost && instance instanceof PortalHost) return;

    let stopped = false;
    const events = /** @type {Object<symbol, unknown>} */ (/** @type {unknown} */ (instance))[
        EVENTS
    ];
    if (events) {
        stopped = emitBroadcast(
            /** @type {import('./component.js').Component} */ (instance),
            eventName,
            ...args,
        ).stopped;
    }
    if (stopped) return;

    // Forward broadcast through PortalChild bridge to the real child
    if (PortalChild && instance instanceof PortalChild) {
        const pc = /** @type {unknown} */ (instance);
        const host = registry.reactor.getPortalHostSync(
            /** @type {{portalHostId: string}} */ (pc).portalHostId,
        );
        if (host) {
            host.broadcastToChild(
                /** @type {{getChildCode: () => string}} */ (pc).getChildCode(),
                eventName,
                args,
            );
        }
    }

    if (entry.children) {
        for (const [childCode] of entry.children) {
            const childEntry = registry.getEntry(childCode);
            if (childEntry) {
                _broadcastToEntry(registry, childEntry, eventName, args);
            }
        }
    }
}
