import { Component } from '../component.js';

/**
 * Built-in root wrapper component.
 * Created automatically by reactor.start() to wrap the user's app component
 * and the default PortalHost. The user never interacts with this directly.
 */
export class Root extends Component {
    static componentName = 'FuseWire/Root';

    /**
     * The main application component.
     * @type {import('../component.js').Child|Component}
     */
    app;

    /**
     * The framework's default portal host.
     * @type {import('../component.js').Child|Component}
     */
    portal;

    /**
     * Pass-through for routing — the router walks through to reach the app.
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}
