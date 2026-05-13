/**
 * Interface for a state serializer capable of converting component vars to/from strings.
 * @typedef {Object<string, function>} SerializerLike
 * @property {function(import('./component.js').ComponentVars): string} stringify - Convert vars object to a string
 * @property {function(string): import('./component.js').ComponentVars} parse - Convert string back to a vars object
 */

/**
 * Envelope containing a component's serialized state and optional extra state.
 * @typedef {Object<string, any>} StateEnvelope
 * @property {string} vars - Serialized component state variables
 * @property {object|null} extraState - Additional opaque data returned by destroy()
 * @property {string} [version] - Template version hash when the state was captured
 */

/**
 * Persistence layer for component state orchestration.
 * Decouples state storage from the InstanceRegistry.
 */
export class Persistence {
    /**
     * Internal memory store for serialized state envelopes.
     * @type {Map<string, StateEnvelope>}
     */
    #store;

    /**
     * Initializes the persistence layer with an optional custom serializer.
     * @param {SerializerLike} [serializer=JSON] - Custom serializer explicitly handling Component conversions
     */
    constructor(serializer = /** @type {SerializerLike} */ (/** @type {unknown} */ (JSON))) {
        this.serializer = serializer;
        this.#store = new Map();
    }

    /**
     * Serializes var payload and pushes wrapped envelope into the persistent store.
     * @param {string} componentCode - The global component identity.
     * @param {{ vars: import('./component.js').ComponentVars, extraState: object|null, version?: string }} payload - Component state details to freeze.
     */
    persist(componentCode, payload) {
        let serializedVars;
        try {
            serializedVars = this.serializer.stringify(payload.vars);
        } catch (e) {
            console.error(`[Persistence] Failed to serialize vars for ${componentCode}:`, e);
            throw e;
        }

        this.#store.set(componentCode, {
            vars: serializedVars,
            extraState: payload.extraState,
            version: payload.version,
        });
    }

    /**
     * Alias for persist().
     * @param {string} componentCode - The global component identity.
     * @param {{ vars: import('./component.js').ComponentVars, extraState: object|null, version?: string }} payload - Component state details to freeze.
     * @returns {void}
     */
    save(componentCode, payload) {
        return this.persist(componentCode, payload);
    }

    /**
     * Retrieves wrapped envelope, parsing the serialized vars natively.
     * CONSUMES the state (destructive load) to prevent duplicate restoration.
     * @param {string} componentCode - The global component identity.
     * @returns {{ vars: import('./component.js').ComponentVars, extraState: object|null, version?: string }|null} Hydrated state payload or null if absent.
     */
    restore(componentCode) {
        const envelope = this.#store.get(componentCode);
        if (!envelope) return null;

        // Destructive load: remove state from store immediately
        this.#store.delete(componentCode);

        let hydratedVars;
        try {
            hydratedVars = this.serializer.parse(envelope.vars);
        } catch (e) {
            console.error(`[Persistence] Failed to parse vars for ${componentCode}:`, e);
            hydratedVars = {};
        }

        return {
            vars: hydratedVars,
            extraState: envelope.extraState,
            version: envelope.version,
        };
    }

    /**
     * Alias for restore().
     * @param {string} componentCode - The global component identity.
     * @returns {{ vars: import('./component.js').ComponentVars, extraState: object|null, version?: string }|null} Hydrated state payload or null if absent.
     */
    load(componentCode) {
        return this.restore(componentCode);
    }

    /**
     * Removes saved state for a specific component.
     * @param {string} componentCode - The global component identity.
     */
    delete(componentCode) {
        this.#store.delete(componentCode);
    }

    /**
     * Synchronous check if a component has saved state.
     * @param {string} componentCode - The global component identity.
     * @returns {boolean} True if state exists for this specific component.
     */
    has(componentCode) {
        return this.#store.has(componentCode);
    }
}
