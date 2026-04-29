/**
 * Interface for a state serializer capable of converting component vars to/from strings.
 * @typedef {Object<string, *>} SerializerLike
 * @property {function(import('./component.js').ComponentVars): string} stringify - Convert vars object to a string
 * @property {function(string): import('./component.js').ComponentVars} parse - Convert string back to a vars object
 */

/**
 * Envelope containing a component's serialized state and optional extra state.
 * @typedef {Object<string, *>} StateEnvelope
 * @property {string} vars - Serialized component state variables
 * @property {object|null} extraState - Additional opaque data returned by destroy()
 */

/**
 * Persistence layer for component state orchestration.
 * Decouples state storage from the InstanceRegistry.
 * Currently uses an in-memory Map, but provides the explicit API contract
 * required to swap down to IndexedDB + Web Workers seamlessly.
 */
export class Persistence {
    /** 
     * Internal memory store for serialized state envelopes.
     * @type {Map<string, StateEnvelope>} 
     */
    #store;

    /**
     * Initializes the persistence layer with an optional custom serializer.
     * @param {SerializerLike} [serializer=JSON] - Custom serializer explicitly handling Component conversions (defaults to JSON)
     */
    constructor(serializer = JSON) {
        this.serializer = serializer;
        this.#store = new Map();
    }

    /**
     * Serializes var payload and pushes wrapped envelope into the persistent store.
     * @param {string} componentCode - The global component identity.
     * @param {{ vars: import('./component.js').ComponentVars, extraState: object|null }} payload - Component state details to freeze.
     */
    save(componentCode, payload) {
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
        });
    }

    /**
     * Retrieves wrapped envelope, parsing the serialized vars natively.
     * @param {string} componentCode - The global component identity.
     * @returns {{ vars: import('./component.js').ComponentVars, extraState: object|null }|null} Hydrated state payload or null if absent.
     */
    load(componentCode) {
        const envelope = this.#store.get(componentCode);
        if (!envelope) return null;

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
        };
    }

    /**
     * Removes saved state for a specific component.
     * @param {string} componentCode - The global component identity.
     */
    delete(componentCode) {
        this.#store.delete(componentCode);
    }

    /**
     * Synchronous check if a component has saved state. Used heavily by InstanceRegistry eager creation flow orchestration.
     * @param {string} componentCode - The global component identity.
     * @returns {boolean} True if state exists for this specific component.
     */
    has(componentCode) {
        return this.#store.has(componentCode);
    }
}
