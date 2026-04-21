import { Component } from '/js/component.js';

/**
 * Demonstrates URL-driven state via the HistoryRouter.
 *
 * The component reads `message` and `color` from the URL segment and
 * displays them. Users can edit the values in the input fields or
 * directly in the browser address bar — both stay in sync.
 */
export class UrlDemo extends Component {
    /** @type {string} */
    message = 'Hello from the URL!';
    /** @type {string} */
    color = '#0d6efd';

    /**
     * Read initial values from the URL segment if available.
     * @param {Object<string, *>|null} previousState - State from previous destroy(), or null
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     */
    async init(previousState, routeSegment) {
        if (routeSegment) {
            this.message = routeSegment.getString('message', this.message);
            this.color = routeSegment.getString('color', this.color);
        }
        this.console.log('UrlDemo created — try editing the URL!');
    }

    /**
     * Declare the URL properties this component contributes.
     * @returns {Object<string, string>} Route state
     */
    routeState() {
        return { message: this.message, color: this.color };
    }

    /**
     * Read current values from the form inputs, push a new URL entry, and
     * re-render so the title and color swatch reflect the new state.
     */
    applyChanges() {
        this.message = /** @type {HTMLInputElement} */ (this.querySelector('#url-msg')).value;
        this.color = /** @type {HTMLInputElement} */ (this.querySelector('#url-color')).value;
        this.pushRoute();
        this.react();
    }
}
