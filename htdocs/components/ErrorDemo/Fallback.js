import { Component } from '/js/component.js';

/**
 *
 */
export class Fallback extends Component {
    /** @type {string} */
    errorMessage = '';

    /** @type {string} */
    failedComponent = '';

    /** @type {number} */
    tries = 1;

    /**
     * Compute whether to show the load count.
     * @returns {boolean} True if load count should be shown
     */
    get $showLoadCount() {
        return this.tries > 1;
    }
}
