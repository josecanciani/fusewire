import { Component } from '../component.js';
import { COMPONENT_ID, REACTOR } from '../symbols.js';

/**
 * Built-in portal host component.
 * Renders portal children via fw-each. Registers itself with the Reactor
 * so PortalChild instances can connect by ID. Intercepts child events via
 * wildcard on('*') and wraps them as fw-portal-event for PortalChild to unpack.
 *
 * PortalHost subtrees are excluded from broadcast tree walks to prevent
 * double-delivery — broadcasts reach portal children via PortalChild forwarding.
 */
export class PortalHost extends Component {
    static componentName = 'FuseWire/PortalHost';

    /**
     * The list of children currently rendered in this portal.
     * @type {Array<import('../component.js').Child|Component>}
     */
    children = [];

    /**
     * Register this host with the reactor so PortalChild instances can find it.
     */
    async init() {
        this[REACTOR].registerPortalHost(this[COMPONENT_ID].id, this);
    }

    /**
     * Add a child component to render in this portal.
     * Subscribes to all child events via wildcard and wraps them as
     * fw-portal-event so PortalChild can forward them to the logical parent.
     * @template T
     * @param {string} name - Component name (e.g. 'Cart/Modal')
     * @param {string} id - Instance id
     * @param {import('../component.js').ComponentVars} vars - Initial vars for the child
     * @returns {T|any} The child reference
     */
    addChild(name, id, vars) {
        const child = this.createChild(name, id, vars);
        this.children.push(child);

        // Intercept ALL events from this child and wrap them
        child.on('*', (/** @type {string} */ eventName, /** @type {any[]} */ ...args) => {
            this.emit('fw-portal-event', {
                childCode: child.componentCode,
                eventName,
                args,
            });
        });

        this.react();
        return child;
    }

    /**
     * Remove a child by component code.
     * Called by PortalChild.destroy() to clean up the real child.
     * @param {string} childCode - Component code to remove (e.g. 'Cart/Modal#main')
     */
    removeChild(childCode) {
        this.children = this.children.filter((c) => c.componentCode !== childCode);
        this.react();
    }

    /**
     * Broadcast an event to a specific child's subtree.
     * Called by PortalChild to forward broadcasts from the main tree.
     * @param {string} childCode - Target child component code
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Event arguments
     */
    broadcastToChild(childCode, eventName, args) {
        const child = this.children.find((c) => c.componentCode === childCode);
        if (child instanceof Component) {
            child.broadcast(eventName, ...args);
        }
    }

    /**
     * Unregister from the reactor on destruction.
     */
    destroy() {
        this[REACTOR].unregisterPortalHost(this[COMPONENT_ID].id);
    }

    /**
     * Pass-through for routing — PortalHost does not contribute URL state.
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}
