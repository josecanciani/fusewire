import { Component } from '/js/component.js';

/**
 * Game of Life component. Manages the engine, cell grid, and UI sub-components.
 */
export class Game extends Component {
    /**
     * Number of columns in the grid.
     * @type {number}
     */
    cols = 0;
    /**
     * Collection of rendered cell components.
     * @type {Array.<import('./Alive.js').Alive|import('./Dead.js').Dead>}
     */
    cells = [];
    /**
     * Visibility state for the help overlay.
     * @type {boolean}
     */
    #showHelp = false;
    /**
     * The controls sub-component.
     * @type {import('./Controls.js').Controls}
     */
    controls = null;
    /**
     * The stats sub-component.
     * @type {import('./Stats.js').Stats}
     */
    stats = null;
    /**
     * The help sub-component.
     * @type {import('./Help.js').Help}
     */
    help = null;

    /**
     * The underlying game engine instance.
     * @type {import('./Engine.js').Engine}
     */
    #engine;
    /**
     * Observer for window/container resizing.
     * @type {ResizeObserver}
     */
    #resizeObserver;
    #resizePending = false;
    #wasRunning = false;
    /**
     * Timer for DOM synchronization batching.
     * @type {number|null}
     */
    #syncTimer = null;
    /**
     * Callback invoked after DOM synchronization completes.
     * @type {function(): void}
     */
    #onSyncComplete = null;

    /**
     * Declare child components and wire control events.
     */
    async init() {
        this.loadLibrary('GameOfLife/Engine');

        this.controls = this.createChild('GameOfLife/Controls', 'controls', {});
        this.controls.on('play', () => this.#engine.play());
        this.controls.on('pause', () => this.#engine.pause());
        this.controls.on('step', () => this.#engine.step());
        this.controls.on('reset', () => this.#engine.reset());
        this.controls.on('speed', (level) => this.#engine.setSpeed(level));
        this.controls.on('help', (show) => this.#setHelp(show));

        this.stats = this.createChild('GameOfLife/Stats', 'stats', {});
        this.help = this.createChild('GameOfLife/Help', 'help', {});
    }

    /**
     * Instantiate the simulation engine and attach a ResizeObserver to the grid element.
     */
    hydrate() {
        const Engine = /** @type {typeof import('./Engine.js').Engine} */ (
            this.library('GameOfLife/Engine').Engine
        );
        this.#engine = new Engine((grid, engineStats, done) => {
            this.stats.update(/** @type {Record<string, number>} */ (engineStats));
            this.#syncCells(grid, done);
        });

        const gridEl = this.querySelector('.grid');
        this.#resizeObserver = new ResizeObserver(() => this.#debounceResize(gridEl));
        this.#resizeObserver.observe(gridEl);
    }

    /**
     * Stop the simulation, destroy the engine, and disconnect the ResizeObserver.
     */
    destroy() {
        clearTimeout(this.#syncTimer);
        this.#engine.destroy();
        this.#resizeObserver.disconnect();
    }

    /**
     * Whether to show the help panel.
     * @type {boolean}
     */
    get $showHelp() {
        return this.#showHelp;
    }

    /**
     * Update help panel visibility from controls
     * @param {boolean} show - Whether to show the help panel
     */
    #setHelp(show) {
        this.#showHelp = show;
        this.react();
    }

    /**
     * Debounce resize events so the engine only resizes once the browser settles
     * @param {Element} gridEl - The grid element to measure
     */
    #debounceResize(gridEl) {
        if (this.#resizePending) {
            return;
        }
        this.#resizePending = true;
        clearTimeout(this.#syncTimer);
        this.#onSyncComplete = null;
        this.#wasRunning = this.#engine.isRunning();
        if (this.#wasRunning) {
            this.#engine.pause();
        }
        this.controls.disable();
        this.#pollResize(gridEl);
    }

    /**
     * Poll until the grid size stops changing, then apply the resize
     * @param {Element} gridEl - The grid element to measure
     */
    #pollResize(gridEl) {
        const { width, height } = gridEl.getBoundingClientRect();
        setTimeout(() => {
            const current = gridEl.getBoundingClientRect();
            if (current.width !== width || current.height !== height) {
                this.#pollResize(gridEl);
                return;
            }
            this.#resizePending = false;
            const wasRunning = this.#wasRunning;
            /**
             * Restores runtime state post resize evaluation.
             */
            this.#onSyncComplete = () => {
                this.controls.enable();
                if (wasRunning) {
                    this.#engine.play();
                }
            };
            this.#engine.resize(current.width, current.height);
            // If resize was a no-op (same dimensions), sync never started
            if (this.#onSyncComplete) {
                const cb = this.#onSyncComplete;
                this.#onSyncComplete = null;
                cb();
            }
        }, 150);
    }

    /**
     * Sync the cell component array from the engine grid in chunks to avoid blocking the main thread.
     * Cancels any in-progress sync before starting.
     * @param {Array.<Array.<boolean>>} grid - Current grid state
     * @param {function(): void} done - Callback to invoke when rendering is complete (signals the engine to continue)
     */
    #syncCells(grid, done) {
        clearTimeout(this.#syncTimer);
        this.cols = grid[0].length;
        const onComplete = this.#onSyncComplete;
        this.#onSyncComplete = null;
        /**
         * Intermediate accumulator for new cell instances during sync batching.
         * @type {any[]}
         */
        const cells = [];
        let currentRow = 0;
        const ROWS_PER_BATCH = 50;

        /**
         * Generates the cell grid iteratively as DOM mounts.
         */
        const processBatch = () => {
            const endRow = Math.min(currentRow + ROWS_PER_BATCH, grid.length);
            for (let r = currentRow; r < endRow; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    cells.push(
                        this.createChild(
                            grid[r][c] ? 'GameOfLife/Alive' : 'GameOfLife/Dead',
                            `${r}-${c}`,
                            {},
                        ),
                    );
                }
            }
            currentRow = endRow;
            if (currentRow < grid.length) {
                this.#syncTimer = setTimeout(processBatch, 0);
                return;
            }
            this.#syncTimer = null;
            this.cells =
                /** @type {Array.<import('./Alive.js').Alive|import('./Dead.js').Dead>} */ (cells);
            this.react();
            done();
            if (onComplete) {
                onComplete();
            }
        };

        processBatch();
    }
}
