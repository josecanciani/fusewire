/**
 * Base class for all FuseWire errors
 */
export class FuseWireError extends Error {
    /**
     * Create a new FuseWireError.
     * @param {string} message - Human-readable error message
     * @param {string} [code='FUSEWIRE_ERROR'] - Machine-readable error code
     */
    constructor(message, code = 'FUSEWIRE_ERROR') {
        super(message);
        this.name = this.constructor.name;
        this.code = code;

        // Maintains proper stack trace for where error was thrown (V8 only)
        // @ts-ignore - V8-specific API, not in standard TypeScript DOM types
        if (Error.captureStackTrace) {
            // @ts-ignore
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Thrown when a component cannot be found
 */
export class ComponentNotFoundError extends FuseWireError {
    /**
     * Create a ComponentNotFoundError.
     * @param {string} componentName - The component name that was not found
     */
    constructor(componentName) {
        super(`Component not found: ${componentName}`, 'COMPONENT_NOT_FOUND');
        this.componentName = componentName;
    }
}

/**
 * Thrown when a template cannot be found or loaded
 */
export class TemplateNotFoundError extends FuseWireError {
    /**
     * Create a TemplateNotFoundError.
     * @param {string} componentName - The component name whose template was not found
     */
    constructor(componentName) {
        super(`Template not found for component: ${componentName}`, 'TEMPLATE_NOT_FOUND');
        this.componentName = componentName;
    }
}

/**
 * Thrown when rendering fails
 */
export class RenderError extends FuseWireError {
    /**
     * Create a RenderError.
     * @param {string} message - Description of the render failure
     * @param {import('../component-id.js').ComponentId} componentId - Identity of the component that failed to render
     */
    constructor(message, componentId) {
        super(`Render error: ${message}`, 'RENDER_ERROR');
        this.componentId = componentId;
    }
}
