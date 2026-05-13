import { Component } from '/js/component.js';

/**
 * Heavy component that takes time to initialize.
 */
export class Lazy extends Component {
    /**
     * duration property.
     * @type {number}
     */
    duration = 3000;

    /**
     * Simulate heavy initialization
     * @param {Object<string, *>|null} previousState - State from previous destroy()
     * @async
     * @returns {Promise<void>}
     */
    async init(previousState) {
        if (!previousState) {
            await new Promise((resolve) => setTimeout(resolve, this.duration));
        }
    }

    /**
     * Return state to signal to init() that this is a restore.
     * @returns {Object<string, *>} Restored state marker
     */
    destroy() {
        return { restored: true };
    }
}
