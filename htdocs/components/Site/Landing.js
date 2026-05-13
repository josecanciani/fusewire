import { Component } from '../../js/component.js';

/**
 * Landing page for FuseWire.
 * Showcases the philosophy and main features with a modern techy style.
 */
export class Landing extends Component {
    /**
     * Declare landing as a routed component.
     * Returns an empty object to ensure the segment key 'home' appears in the URL.
     * @returns {Object<string, string>} Empty route state
     */
    routeState() {
        return {};
    }

    /**
     * Navigate to a page via the parent Main component.
     * @param {string} page - Target page name
     */
    goTo(page) {
        this.componentParent.navigate(page);
    }
}
