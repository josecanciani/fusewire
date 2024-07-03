export class FuseWireError extends Error {
    constructor(message, opts) {
        super(message, opts);
        this.name = 'FuseWireError';
    }
}

export class FuseWireComponentNotFound extends FuseWireError {
    constructor(id) {
        super(`Component not found: "${id}"`);
    }
}

export class FuseWireTemplateNotFound extends FuseWireError {
    constructor(name) {
        super(`Component Teamplate not found: "${name}"`);
    }
}

export class FuseWireConfigMissing extends FuseWireError {
    /** @param {String} name */
    constructor(name) {
        super(`Config not defined: "${name}`);
    }
}
