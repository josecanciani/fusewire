import { Component } from '../../js/component.js';

/**
 *
 */
export class Stats extends Component {
    /**
     * generation property.
     * @type {number}
     */
    generation = 0;
    /**
     * cellCount property.
     * @type {number}
     */
    cellCount = 0;
    /**
     * totalCreated property.
     * @type {number}
     */
    totalCreated = 0;
    /**
     * totalDestroyed property.
     * @type {number}
     */
    totalDestroyed = 0;
    /**
     * createdPerSecond property.
     * @type {number}
     */
    createdPerSecond = 0;
    /**
     * maxCreatedPerSecond property.
     * @type {number}
     */
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
