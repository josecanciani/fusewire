/**
 * @typedef {Object} ResizeOptions
 * @property {number} [minSize]
 * @property {number} [minGap]
 * @property {number} [direction] -1 for right/bottom items, 1 for left/top items
 */

/**
 * Start a horizontal resize drag on a flex pane.
 *
 * Call from a mousedown handler on a resize handle sitting between two flex
 * children. While the user drags, the target element's flex-basis is updated.
 *
 * The returned object exposes `width` (read it in afterRender to restore size
 * after a DOM re-render) and `cancel()` (call it when the owning component
 * navigates away or is destroyed).
 *
 * @param {MouseEvent} event - The mousedown event on the resize handle
 * @param {HTMLElement} target - The element whose flex-basis will be resized
 * @param {ResizeOptions} [options] - Resize constraints
 * @returns {{ size: number, cancel: function(): void }} Resize controller
 */
export function startHorizontalResize(
    event,
    target,
    { minSize = 200, minGap = 300, direction = -1 } = {},
) {
    event.preventDefault();
    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    const startPos = event.clientX;
    const startSize = target.getBoundingClientRect().width;

    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';

    const state = { size: startSize, cancel: null };
    let active = true;

    /**
     * Records delta difference moving horizontal blocks dynamically.
     * @param {MouseEvent} ev - Moving Event
     */
    const onMove = (ev) => {
        const delta = (ev.clientX - startPos) * direction;
        const maxSize = target.parentElement.getBoundingClientRect().width - minGap;
        state.size = Math.max(minSize, Math.min(startSize + delta, maxSize));
        target.style.flexBasis = `${state.size}px`;
    };

    /**
     * Safely dispatches the end of a moving block transaction.
     */
    const cleanup = () => {
        if (!active) return;
        active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
    };

    /**
     * Mouse detachment unmount.
     * @returns {void}
     */
    const onUp = () => cleanup();

    state.cancel = cleanup;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return state;
}

/**
 * Start a vertical resize drag on a flex pane.
 *
 * @param {MouseEvent} event - The mousedown event on the resize handle
 * @param {HTMLElement} target - The element whose flex-basis will be resized
 * @param {ResizeOptions} [options] - Resize constraints
 * @returns {{ size: number, cancel: function(): void }} Resize controller
 */
export function startVerticalResize(
    event,
    target,
    { minSize = 100, minGap = 100, direction = -1 } = {},
) {
    event.preventDefault();
    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    const startPos = event.clientY;
    const startSize = target.getBoundingClientRect().height;

    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';

    const state = { size: startSize, cancel: null };
    let active = true;

    /**
     * Records delta difference moving vertical blocks dynamically.
     * @param {MouseEvent} ev - Moving Event
     */
    const onMove = (ev) => {
        const delta = (ev.clientY - startPos) * direction;
        const maxSize = target.parentElement.getBoundingClientRect().height - minGap;
        state.size = Math.max(minSize, Math.min(startSize + delta, maxSize));
        target.style.height = `${state.size}px`;
    };

    /**
     * Safely dispatches the end of a moving block transaction.
     */
    const cleanup = () => {
        if (!active) return;
        active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
    };

    /**
     * Mouse detachment unmount.
     * @returns {void}
     */
    const onUp = () => cleanup();

    state.cancel = cleanup;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return state;
}
