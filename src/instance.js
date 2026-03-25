import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { compileTemplate } from './template-compiler.js';

/**
 * InstanceRegistry manages component instances and their lifecycle.
 * 
 * Responsibilities:
 * - Create/update/remove component instances
 * - Call lifecycle hooks (hydrate, update, destroy)
 * - Coordinate rendering with Renderer
 * - Manage component tree (parent/child relationships)
 */
export class InstanceRegistry {
    constructor(renderer, templateStore) {
        this._renderer = renderer;
        this._templateStore = templateStore;
        this._instances = new Map(); // componentId.toCode() -> { instance, container }
    }

    /**
     * Create a new component instance
     * @param {ComponentId} componentId
     * @param {Function} ComponentClass
     * @param {Object} vars Initial vars
     * @param {HTMLElement} container DOM container
     * @returns {Component} The created instance
     */
    async create(componentId, ComponentClass, vars, container) {
        const code = componentId.toCode();
        if (this._instances.has(code)) {
            throw new Error(`Component ${code} already exists in registry`);
        }

        const instance = new ComponentClass(componentId.id, vars);
        
        // Call hydrate hook
        await instance.hydrate();
        
        // Store instance and container
        this._instances.set(code, { instance, container });
        
        // Initial render
        await this.render(componentId);
        
        // Call afterRender hook
        await instance.afterRender();
        
        return instance;
    }

    /**
     * Get an existing instance
     * @param {ComponentId} componentId
     * @returns {Component|null}
     */
    get(componentId) {
        const code = componentId.toCode();
        const entry = this._instances.get(code);
        return entry ? entry.instance : null;
    }

    /**
     * Update an existing instance with new vars
     * @param {ComponentId} componentId
     * @param {Object} newVars
     */
    async update(componentId, newVars) {
        const code = componentId.toCode();
        const entry = this._instances.get(code);
        
        if (!entry) {
            throw new ComponentNotFoundError(code);
        }
        
        const { instance } = entry;
        const oldVars = { ...instance.vars };
        
        // Update vars
        Object.assign(instance.vars, newVars);
        
        // Call update hook
        await instance.update(oldVars);
        
        // Re-render
        await this.render(componentId);
        
        // Call afterRender hook
        await instance.afterRender();
    }

    /**
     * Remove instance and clean up
     * @param {ComponentId} componentId
     */
    async remove(componentId) {
        const code = componentId.toCode();
        const entry = this._instances.get(code);
        
        if (!entry) {
            return; // Silently ignore non-existent instances
        }
        
        const { instance, container } = entry;
        
        // Call destroy hook
        await instance.destroy();
        
        // Remove from DOM
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
        
        // Remove from registry
        this._instances.delete(code);
    }

    /**
     * Render a component instance to its container
     * @param {ComponentId} componentId
     */
    async render(componentId) {
        const code = componentId.toCode();
        const entry = this._instances.get(code);
        
        if (!entry) {
            throw new ComponentNotFoundError(code);
        }
        
        const { instance, container } = entry;
        const componentName = instance.constructor.componentName;
        
        // Get template from store
        const template = this._templateStore.get(componentName);
        if (!template) {
            throw new Error(`Template not found for component ${componentName}`);
        }
        
        // Get or compile template
        let compiled = this._templateStore.getCompiled(componentName);
        if (!compiled) {
            compiled = compileTemplate(
                template.htmlCode || '',
                template.cssCode || ''
            );
            this._templateStore.setCompiled(componentName, compiled);
        }
        
        // Render to DOM
        this._renderer.render(
            container,
            compiled,
            instance.vars,
            componentId
        );
        
        // TODO: Find child mount points and recursively render children
        // This will be implemented when we add parent/child component support
    }

    /**
     * Check if instance exists
     * @param {ComponentId} componentId
     * @returns {boolean}
     */
    has(componentId) {
        return this._instances.has(componentId.toCode());
    }

    /**
     * Get container element for an instance
     * @param {ComponentId} componentId
     * @returns {HTMLElement|null}
     */
    getContainer(componentId) {
        const entry = this._instances.get(componentId.toCode());
        return entry ? entry.container : null;
    }

    /**
     * Clear all instances (for cleanup/testing)
     */
    async clearAll() {
        const codes = Array.from(this._instances.keys());
        for (const code of codes) {
            // Parse code back to ComponentId
            const { ComponentId } = await import('./component-id.js');
            const componentId = ComponentId.fromCode(code);
            await this.remove(componentId);
        }
    }
}
