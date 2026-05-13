import { Component } from '../../js/component.js';

/**
 * Simulation controls panel for Conway's Game of Life.
 */
export class Controls extends Component {
    /**
     * Is the simulation currently running.
     * @type {boolean}
     */
    running = false;
    /**
     * Current speed level (0-100).
     * @type {number}
     */
    speedLevel = 20;
    /**
     * Whether the help overlay is shown.
     * @type {boolean}
     */
    #showHelp = false;
    /**
     * Disable UI interactions.
     * @type {boolean}
     */
    disabled = false;

    /**
     * Whether to show the help panel.
     * @type {boolean}
     */
    get $showHelp() {
        return this.#showHelp;
    }

    /**
     * Disable all controls (e.g. during resize)
     */
    disable() {
        this.disabled = true;
        this.react();
    }

    /**
     * Re-enable all controls
     */
    enable() {
        this.disabled = false;
        this.react();
    }

    /**
     * Start the simulation and notify the parent
     */
    play() {
        this.running = true;
        this.emit('play');
        this.react();
    }

    /**
     * Pause the simulation and notify the parent
     */
    pause() {
        this.running = false;
        this.emit('pause');
        this.react();
    }

    /**
     * Advance one generation (pauses if running) and notify the parent
     */
    step() {
        this.running = false;
        this.emit('step');
        this.react();
    }

    /**
     * Reset the simulation and notify the parent
     */
    reset() {
        this.running = false;
        this.emit('reset');
        this.react();
    }

    /**
     * Handle speed slider change and emit speed event
     * @param {Event} event - The input event from the range slider
     */
    changeSpeed(event) {
        const level = parseInt(/** @type {HTMLInputElement} */ (event.target).value, 10);
        this.speedLevel = level;
        this.emit('speed', level);
        this.react();
    }

    /**
     * Toggle help panel visibility and notify the parent
     */
    toggleHelp() {
        this.#showHelp = !this.#showHelp;
        this.emit('help', this.#showHelp);
        this.react();
    }
}
