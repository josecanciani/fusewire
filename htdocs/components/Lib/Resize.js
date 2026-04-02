/**
 * @typedef {Object} ResizeOptions
 * @property {number} [minWidth]
 * @property {number} [minGap]
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
 * @returns {{ width: number, cancel: function(): void }} Resize controller
 */
export function startHorizontalResize(event, target, { minWidth = 200, minGap = 300 } = {}) {
    event.preventDefault();
    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    const startX = event.clientX;
    const startWidth = target.getBoundingClientRect().width;

    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';

    const state = { width: startWidth, cancel: null };
    let active = true;

    const onMove = (ev) => {
        const delta = startX - ev.clientX;
        const maxWidth = target.parentElement.getBoundingClientRect().width - minGap;
        state.width = Math.max(minWidth, Math.min(startWidth + delta, maxWidth));
        target.style.flexBasis = `${state.width}px`;
    };

    const cleanup = () => {
        if (!active) return;
        active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
    };

    const onUp = () => cleanup();

    state.cancel = cleanup;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return state;
}
