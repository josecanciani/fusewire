import { Component } from '/js/component.js';

/**
 * Main demo component for lazy loading.
 */
export class LazyParent extends Component {
    /**
     * child property.
     * @type {import('/js/component.js').Lazy}
     */
    child = null;

    /**
     * Create the lazy child, showing a placeholder while the real component loads.
     */
    async init() {
        this.child = this.createLazyChild(
            // We pass this randomly generated ID the Playground gave us
            // so that the framework doesn't return a cached instance if you run it multiple times.
            this.createChild('Lazy/Lazy', this.componentId),
            this.createChild('Lazy/LazyLoading'),
        );
    }
}
