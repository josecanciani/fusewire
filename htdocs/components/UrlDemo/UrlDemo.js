import { Component } from '/js/component.js';

/**
 * Demonstrates URL-driven state via the HistoryRouter.
 *
 * The component reads `message` and `color` from the URL segment and
 * displays them. Users can edit the values in the input fields or
 * directly in the browser address bar — both stay in sync.
 */
export class UrlDemo extends Component {
    /**
     * message property.
     * @type {string}
     */
    message = 'Hello from the URL!';
    /**
     * color property.
     * @type {string}
     */
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
     * Handle URL changes (browser back/forward or eager hydration).
     * @param {import('/js/component.js').ComponentVars} newVars - Vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     * @returns {Promise<void>} Resolves when the update is complete
     */
    async update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            if (!('message' in newVars)) {
                newVars.message = routeSegment.getString('message', this.message);
            }
            if (!('color' in newVars)) {
                newVars.color = routeSegment.getString('color', this.color);
            }
        }
        return super.update(newVars, react, routeSegment);
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
