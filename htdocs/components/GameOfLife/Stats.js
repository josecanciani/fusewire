import { Component } from '/js/component.js';

/**
 *
 */
export class Stats extends Component {
    /** @type {number} */
    generation = 0;
    /** @type {number} */
    cellCount = 0;
    /** @type {number} */
    totalCreated = 0;
    /** @type {number} */
    totalDestroyed = 0;
    /** @type {number} */
    createdPerSecond = 0;
    /** @type {number} */
    maxCreatedPerSecond = 0;

    /**
     * Reset all stats to zero and re-render
     */
    reset() {
        this.generation = 0;
        this.cellCount = 0;
        this.totalCreated = 0;
        this.totalDestroyed = 0;
        this.createdPerSecond = 0;
        this.maxCreatedPerSecond = 0;
        this.react();
    }
}
