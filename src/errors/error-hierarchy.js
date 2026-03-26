/**
 * Base class for all FuseWire errors
 */
export class FuseWireError extends Error {
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
    constructor(componentName) {
        super(
            `Component not found: ${componentName}`,
            'COMPONENT_NOT_FOUND',
        );
        this.componentName = componentName;
    }
}

/**
 * Thrown when a template cannot be found or loaded
 */
export class TemplateNotFoundError extends FuseWireError {
    constructor(componentName) {
        super(
            `Template not found for component: ${componentName}`,
            'TEMPLATE_NOT_FOUND',
        );
        this.componentName = componentName;
    }
}

/**
 * Thrown when rendering fails
 */
export class RenderError extends FuseWireError {
    constructor(message, componentId) {
        super(`Render error: ${message}`, 'RENDER_ERROR');
        this.componentId = componentId;
    }
}
