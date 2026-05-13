import { Component } from '/js/component.js';

/**
 * Fallback component.
 */
export class Fallback extends Component {
    /**
     * Fallback error message.
     * @type {string}
     */
    errorMessage = '';

    /**
     * Failed component name.
     * @type {string}
     */
    failedComponent = '';

    /**
     * Number of tries.
     * @type {number}
     */
    tries = 1;

    /**
     * Compute whether to show the load count.
     * @returns {boolean} True if load count should be shown
     */
    get $showLoadCount() {
        return this.tries > 1;
    }
}
