import { Component } from '/js/component.js';

/**
 * Main demo component for lazy loading.
 */
export class LazyParent extends Component {
    /** @type {import('/js/component.js').Lazy} */
    child = null;

    /**
     * Create the lazy child, showing a placeholder while the real component loads.
     */
    async init() {
        this.child = /** @type {import('/js/component.js').Lazy} */ (
            this.createLazyChild(
                this.createChild('Lazy/Lazy'),
                this.createChild('Lazy/LazyLoading'),
            )
        );
    }
}
