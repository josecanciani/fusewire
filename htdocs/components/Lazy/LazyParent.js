import { Component } from '/js/component.js';

/**
 * Main demo component for lazy loading.
 */
export class LazyParent extends Component {
    /** @type {import('./Lazy.js').Lazy} */
    child = null;

    async init() {
        this.child = /** @type {any} */ (
            this.createLazyChild(
                this.createChild('Lazy/Lazy'),
                this.createChild('Lazy/LazyLoading'),
            )
        );
    }
}
