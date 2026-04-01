const CELL_SIZE = 6;
const GAP = 0;
const CELL_STEP = CELL_SIZE + GAP;

/**
 * Create a rows x cols grid filled with false (dead cells)
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @returns {Array.<Array.<boolean>>} Empty grid
 */
function createEmptyGrid(rows, cols) {
    return Array.from({ length: rows }, () => new Array(cols).fill(false));
}

/**
 * Randomly seed a grid (~30% alive)
 * @param {Array.<Array.<boolean>>} grid - Grid to seed in place
 */
function seedRandom(grid) {
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            grid[r][c] = Math.random() < 0.3;
        }
    }
}

// Conway's rules: live cell survives with 2-3 neighbours; dead cell
// with exactly 3 neighbours becomes alive; all others die/stay dead.
/**
 * Compute the next generation of the grid
 * @param {Array.<Array.<boolean>>} grid - Current generation
 * @returns {Array.<Array.<boolean>>} Next generation
 */
function nextGeneration(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const next = createEmptyGrid(rows, cols);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let neighbors = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
                        neighbors++;
                    }
                }
            }
            next[r][c] = grid[r][c] ? neighbors === 2 || neighbors === 3 : neighbors === 3;
        }
    }
    return next;
}

// Speed level 1-20 → timer interval in ms (level 1 = 950 ms, level 20 = 0 ms)
/**
 * Convert a speed level to a timer interval in milliseconds
 * @param {number} speedLevel - Speed level (1-20)
 * @returns {number} Interval in milliseconds
 */
function speedToInterval(speedLevel) {
    return 1000 - speedLevel * 50;
}

/**
 * Game of Life simulation engine.
 *
 * Manages the grid, timer, and stats tracking. Calls the provided
 * onStateChange callback whenever the grid or stats change (tick,
 * reset, resize). The component layer translates these into UI updates.
 */
export class Engine {
    #grid = null;
    #rows = 0;
    #cols = 0;
    #timer = null;
    #playing = false;
    #generation = 0;
    #speedLevel = 20;
    #totalCreated = 0;
    #totalDestroyed = 0;
    #createdLog = [];
    #maxCreatedPerSecond = 0;
    #onStateChange;

    /**
     * Create a new simulation engine
     * @param {function(Array.<Array.<boolean>>, object, function(): void): void} onStateChange - Called with (grid, stats, done) on every state change; caller must invoke done() when rendering is complete
     */
    constructor(onStateChange) {
        this.#onStateChange = onStateChange;
    }

    /**
     * Start the simulation timer
     */
    play() {
        this.#playing = true;
        this.#scheduleNextTick();
    }

    /**
     * Stop the simulation timer
     */
    pause() {
        this.#playing = false;
        clearTimeout(this.#timer);
        this.#timer = null;
    }

    /**
     * Advance one generation then pause
     */
    step() {
        this.pause();
        this.#tick();
    }

    /**
     * Reset the grid and all stats, re-seed randomly
     */
    reset() {
        this.pause();
        this.#grid = createEmptyGrid(this.#rows, this.#cols);
        seedRandom(this.#grid);
        this.#generation = 0;
        this.#totalCreated = 0;
        this.#totalDestroyed = 0;
        this.#createdLog = [];
        this.#maxCreatedPerSecond = 0;
        this.#notify();
    }

    /**
     * Update simulation speed
     * @param {number} level - Speed level (1-20)
     */
    setSpeed(level) {
        this.#speedLevel = level;
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#scheduleNextTick();
        }
    }

    /**
     * Resize the grid to fit the given pixel dimensions
     * @param {number} width - Container width in pixels
     * @param {number} height - Container height in pixels
     */
    resize(width, height) {
        if (width === 0 || height === 0) return;
        const cols = Math.max(1, Math.floor((width + GAP) / CELL_STEP));
        const rows = Math.max(1, Math.floor((height + GAP) / CELL_STEP));
        if (rows === this.#rows && cols === this.#cols) return;
        this.#resizeGrid(rows, cols);
        this.#notify();
    }

    /**
     * Check whether the simulation is playing
     * @returns {boolean} True if the simulation is playing
     */
    isRunning() {
        return this.#playing;
    }

    /**
     * Stop the timer and release resources
     */
    destroy() {
        clearTimeout(this.#timer);
    }

    /**
     * Schedule the next tick after the speed-dependent delay
     */
    #scheduleNextTick() {
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.#tick();
        }, speedToInterval(this.#speedLevel));
    }

    #resizeGrid(newRows, newCols) {
        const oldGrid = this.#grid;
        this.#rows = newRows;
        this.#cols = newCols;
        this.#grid = createEmptyGrid(newRows, newCols);
        if (!oldGrid) {
            seedRandom(this.#grid);
            return;
        }
        // Preserve existing cells; new cells stay dead
        const copyRows = Math.min(oldGrid.length, newRows);
        const copyCols = Math.min(oldGrid[0].length, newCols);
        for (let r = 0; r < copyRows; r++) {
            for (let c = 0; c < copyCols; c++) {
                this.#grid[r][c] = oldGrid[r][c];
            }
        }
    }

    #tick() {
        const oldGrid = this.#grid;
        this.#grid = nextGeneration(this.#grid);
        this.#generation++;

        // Count cells that changed state (= components created = components destroyed)
        let changed = 0;
        for (let r = 0; r < this.#rows; r++) {
            for (let c = 0; c < this.#cols; c++) {
                if (oldGrid[r][c] !== this.#grid[r][c]) changed++;
            }
        }

        this.#totalCreated += changed;
        this.#totalDestroyed += changed;

        // Created per second: sliding window over last 1000ms
        const now = performance.now();
        this.#createdLog.push({ time: now, count: changed });
        while (this.#createdLog.length > 1 && this.#createdLog[0].time < now - 1000) {
            this.#createdLog.shift();
        }
        this.#maxCreatedPerSecond = Math.max(this.#maxCreatedPerSecond, this.#sumCreatedLog());

        this.#notify();
    }

    #sumCreatedLog() {
        let total = 0;
        for (const entry of this.#createdLog) {
            total += entry.count;
        }
        return total;
    }

    #notify() {
        this.#onStateChange(
            this.#grid,
            {
                generation: this.#generation,
                cellCount: this.#rows * this.#cols,
                totalCreated: this.#totalCreated,
                totalDestroyed: this.#totalDestroyed,
                createdPerSecond: this.#sumCreatedLog(),
                maxCreatedPerSecond: this.#maxCreatedPerSecond,
            },
            () => {
                if (this.#playing) {
                    this.#scheduleNextTick();
                }
            },
        );
    }
}
