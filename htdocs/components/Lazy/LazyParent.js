import { Component } from '/js/component.js';

/**
 * Main demo component for lazy loading.
 */
export class LazyParent extends Component {
    /** @type {import('./Lazy.js').Lazy | import('/js/component.js').Child} */
    child = null;

    async init() {
        this.child = /** @type {import('./Lazy.js').Lazy | import('/js/component.js').Child} */ (
            this.createLazyChild(
                this.createChild('Lazy/Lazy'),
                this.createChild('Lazy/LazyLoading'),
            )
        );
    }
}
