import { ComponentId } from './component-id.js';

/**
 * Reactor - Simple orchestrator for client-side rendering (Phase 1)
 *
 * In Phase 1, this is a minimal implementation that manages component rendering.
 * Full instance registry and lifecycle management will be added in later phases.
 */
export class Reactor {
    constructor() {
        this._instances = new Map(); // componentId.toCode() -> component instance
        this._containers = new Map(); // componentId.toCode() -> container element
    }

    /**
     * Start a root component
     * @param {HTMLElement} container - Container to render into
     * @param {typeof import('./component.js').Component} ComponentClass - Component class
     * @param {string} id - Component instance ID
     * @param {Object} vars - Initial component variables
     * @returns {import('./component.js').Component} Component instance
     */
    start(container, ComponentClass, id, vars) {
        const componentId = new ComponentId(ComponentClass.componentName, id);
        const instance = new ComponentClass(componentId.toCode(), vars);

        // Attach reactor to component
        instance._reactor = this;

        // Store instance and container
        this._instances.set(componentId.toCode(), instance);
        this._containers.set(componentId.toCode(), container);

        // Call hydrate hook
        instance.hydrate();

        return instance;
    }

    /**
     * Trigger re-render of a component
     * @param {import('./component.js').Component} component - Component to re-render
     * @param {string} mode - Render mode (currently only 'CSR' supported)
     */
    react(component, mode = 'CSR') {
        if (mode !== 'CSR') {
            throw new Error(`Reactor: Unsupported render mode "${mode}"`);
        }

        // Call update hook
        component.update();

        // In Phase 1, we don't actually re-render - that requires Renderer and TemplateStore
        // This is just the orchestration layer
    }
}
