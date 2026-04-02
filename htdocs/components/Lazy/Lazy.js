import { Component } from '/js/component.js';

/**
 * Heavy component that takes time to initialize.
 */
export class Lazy extends Component {
    /** @type {number} */
    duration = 3000;

    /**
     * Simulate heavy initialization
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        await new Promise((resolve) => setTimeout(resolve, this.duration));
    }
}
