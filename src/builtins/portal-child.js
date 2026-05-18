import { Component } from '../component.js';
import { REACTOR } from '../symbols.js';

/**
 * Built-in portal child proxy component.
 * Lives in the requesting component's tree with an empty template.
 * Connects to a PortalHost by ID (via the Reactor) and forwards events
 * bidirectionally: child emissions are unpacked from fw-portal-event,
 * broadcasts are forwarded via host.broadcastToChild().
 */
export class PortalChild extends Component {
    static componentName = 'FuseWire/PortalChild';

    /**
     * Component name of the child to render in the portal (e.g. 'Modal').
     * @type {string}
     */
    targetName;

    /**
     * Instance id for the portal child.
     * @type {string}
     */
    targetId;

    /**
     * Initial variables to pass to the portal child.
     * @type {import('../component.js').ComponentVars}
     */
    targetVars;

    /**
     * The ID of the PortalHost where this child should be rendered.
     * @type {string}
     */
    portalHostId;

    /**
     * The internal component code string for tracking.
     * @type {string}
     */
    #childCode;

    /**
     * The actual component instance rendered in the host.
     * @type {Component}
     */
    #realChild;

    /**
     * Connect to the PortalHost and request creation of the real child.
     * Subscribes to fw-portal-event on the host and re-emits matching
     * events on this component so the parent's .on() handlers fire.
     */
    async init() {
        const host = await this[REACTOR].getPortalHost(this.portalHostId);

        const childRef = host.addChild(this.targetName, this.targetId, this.targetVars);
        this.#childCode = childRef.componentCode;

        // Forward wrapped events from PortalHost → re-emit on self
        host.on(
            'fw-portal-event',
            /**
             * Handle wrapped events from the PortalHost
             * @param {{childCode: string, eventName: string, args: any[]}} evt - The wrapped event
             */
            (evt) => {
                if (evt.childCode === this.#childCode) {
                    this.emit(evt.eventName, ...evt.args);
                }
            },
        );

        this.#realChild = await childRef.whenReady();
    }

    /**
     * Clean up the real child from the PortalHost.
     */
    destroy() {
        const host = this[REACTOR].getPortalHostSync(this.portalHostId);
        host.removeChild(this.#childCode);
    }

    /**
     * Get the component code of the real child in the PortalHost.
     * Used by _broadcastToEntry for forwarding broadcasts.
     * @returns {string} The real child's component code
     */
    getChildCode() {
        return this.#childCode;
    }

    /**
     * Get the real child Component instance from the PortalHost.
     * @template T
     * @returns {T|any} The real child instance
     */
    getChild() {
        return this.#realChild;
    }
}
