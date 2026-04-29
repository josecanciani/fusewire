/** 
 * Reactor instance orchestrating a specific app.
 * @typedef {import('./reactor.js').Reactor} Reactor 
 */
/** 
 * Base Component class.
 * @typedef {import('./component.js').Component} Component 
 */

/**
 * FuseWire - Global registry for managing Reactor instances and components
 */
class FuseWireRegistry {
    /**
     * Create a new FuseWireRegistry.
     */
    constructor() {
        this._reactors = new Map(); // appName -> Reactor
    }

    /**
     * Register a Reactor instance
     * @param {string} appName - Application name
     * @param {Reactor} reactor - Reactor instance
     */
    register(appName, reactor) {
        this._reactors.set(appName, reactor);
    }

    /**
     * Unregister a Reactor instance
     * @param {string} appName - Application name
     */
    unregister(appName) {
        this._reactors.delete(appName);
    }

    /**
     * Get a component instance
     * @param {string} appName - Application name
     * @param {string} componentCode - Component ID code (e.g., "Counter#main")
     * @returns {Component|null} The component instance or null if not found
     */
    get(appName, componentCode) {
        const reactor = this._reactors.get(appName);
        if (!reactor) {
            console.error(`FuseWire: Reactor "${appName}" not found`);
            return null;
        }

        const instance = reactor._instanceRegistry.get(componentCode);

        if (!instance) {
            console.error(
                `FuseWire: Component "${componentCode}" not found in reactor "${appName}"`,
            );
            return null;
        }

        return instance;
    }

    /**
     * Check if an app name is already registered
     * @param {string} appName - Application name
     * @returns {boolean} True if app name is registered
     */
    has(appName) {
        return this._reactors.has(appName);
    }

    /**
     * Get all registered app names
     * @returns {string[]} Array of registered app names
     */
    getApps() {
        return Array.from(this._reactors.keys());
    }
}

// Global singleton instance
export const FuseWire = new FuseWireRegistry();

// Make it available globally for templates
if (typeof window !== 'undefined') {
    // @ts-ignore - Custom global for template event handler access
    window.FuseWire = FuseWire;
}
