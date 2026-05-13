import { Component } from '../js/component.js';

/**
 * Simple counter demo component.
 */
export class Counter extends Component {
    /**
     * The current counter value.
     * @type {number}
     */
    count = 0;

    /**
     * Initialize the counter and log the initial count.
     */
    async init() {
        this.console.log('Counter created with initial count:', this.count);
    }

    /**
     * Log the current count after each render.
     */
    afterRender() {
        // afterRender is called after the component is rendered (data changes and it's re-rendered)
        this.console.log('Counter rendered with count:', this.count);
    }

    /**
     * Increment the counter and re-render.
     */
    increment() {
        this.count++;
        this.react();
    }

    /**
     * Decrement the counter and re-render.
     */
    decrement() {
        this.count--;
        this.react();
    }

    /**
     * Log a message when the counter is destroyed.
     */
    destroy() {
        this.console.log('Counter destroyed');
    }
}
