/**
 * Abstract encoder for route segment property values.
 *
 * The router calls encode() when serializing component state to a URL
 * and decode() when parsing a URL back into component state.
 * Implementations must round-trip: `decode(encode(value)) === value`
 * for any string value.
 *
 * The default MinimalRouteEncoder only escapes the five characters that
 * are structurally significant in the segment format (`/`, `:`, `;`,
 * `=`, `%`), producing human-readable URLs in hash-bang fragments.
 * Developers can inject a stricter encoder (e.g. full percent-encoding)
 * via the HistoryRouter config.
 *
 * @example
 * // Default — minimal encoding, readable URLs
 * const router = new HistoryRouter();
 *
 * // Strict percent-encoding (like encodeURIComponent)
 * const router = new HistoryRouter({ routeEncoder: new StrictRouteEncoder() });
 */
export class RouteEncoder {
    /**
     * Encode a property value for inclusion in a URL segment.
     * Must escape at least the structural delimiters (`/`, `:`, `;`, `=`)
     * and the escape character (`%`) to preserve round-trip correctness.
     * @param {string} value - Raw property value
     * @returns {string} Encoded value safe for URL embedding
     */
    encode(value) {
        void value;
        throw new Error('RouteEncoder.encode() must be implemented by a subclass');
    }

    /**
     * Decode a previously encoded property value back to its original form.
     * @param {string} encoded - Encoded value from the URL
     * @returns {string} Original property value
     */
    decode(encoded) {
        void encoded;
        throw new Error('RouteEncoder.decode() must be implemented by a subclass');
    }
}

/**
 * Default route encoder that only escapes characters ambiguous inside values.
 *
 * Produces clean, human-readable URLs by leaving most punctuation, Unicode,
 * and other harmless characters untouched. Spaces are encoded as `+`
 * (form-encoding convention) because browsers re-encode literal spaces
 * in the address bar as `%20`. Literal `+` signs are percent-encoded
 * to preserve the round-trip.
 *
 * Only characters that would be ambiguous during tokenization are encoded.
 * Structural delimiters that the tokenizer resolves unambiguously via
 * first-match (`=` and `:`) are left as-is in values.
 *
 * | Char | Why | Encoded |
 * |------|-----|---------|
 * | ` `  | browsers re-encode to %20 | `+` |
 * | `+`  | used as space placeholder | `%2B` |
 * | `/`  | path.split('/') splits all | `%2F` |
 * | `;`  | props.split(';') splits all | `%3B` |
 * | `%`  | escape character | `%25` |
 */
export class MinimalRouteEncoder extends RouteEncoder {
    /**
     * Encode a value by escaping only characters that are ambiguous
     * inside values, then replacing spaces with `+`.
     * @param {string} value - Raw property value
     * @returns {string} Minimally encoded value
     */
    encode(value) {
        return value
            .replace(
                /[%+/;]/g,
                (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
            )
            .replace(/ /g, '+');
    }

    /**
     * Decode a value by restoring `+` to spaces, then decoding
     * percent-encoded sequences via the standard `decodeURIComponent`.
     * @param {string} encoded - Encoded value from the URL
     * @returns {string} Original property value
     */
    decode(encoded) {
        return decodeURIComponent(encoded.replace(/\+/g, ' '));
    }
}

/**
 * Typed accessor for a single URL route segment.
 *
 * Each routed component receives a RouteSegment in init() and update()
 * containing the parsed key-value pairs from its URL segment.
 * The developer reads values with explicit types — no auto-coercion.
 *
 * Segment format: `routeKey:prop1=value1;prop2=value2`
 */
export class RouteSegment {
    /**
     * The route key for this segment (e.g. "dashboard").
     * @type {string}
     */
    #key;

    /**
     * Raw key-value pairs parsed from the segment.
     * @type {Map.<string, string>}
     */
    #properties;

    /**
     * Create a RouteSegment from a parsed URL segment
     * @param {string} key - The route key for this segment (e.g. "dashboard", "table")
     * @param {Map.<string, string>} properties - Raw key-value pairs from the URL
     */
    constructor(key, properties = new Map()) {
        this.#key = key;
        this.#properties = properties;
    }

    /**
     * The route key for this segment
     * @returns {string} Route key (e.g. "dashboard")
     */
    get key() {
        return this.#key;
    }

    /**
     * Get a raw string value, or null if the property is not present
     * @param {string} name - Property name
     * @returns {string|null} The value, or null if not present
     */
    get(name) {
        return this.#properties.get(name) ?? null;
    }

    /**
     * Get a string value with a default fallback
     * @param {string} name - Property name
     * @param {string} defaultValue - Fallback if the property is missing
     * @returns {string} The value or the default
     */
    getString(name, defaultValue = '') {
        return this.#properties.get(name) ?? defaultValue;
    }

    /**
     * Get an integer value with a default fallback
     * @param {string} name - Property name
     * @param {number} defaultValue - Fallback if the property is missing or not a number
     * @returns {number} The parsed integer or the default
     */
    getInt(name, defaultValue = 0) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a float value with a default fallback
     * @param {string} name - Property name
     * @param {number} defaultValue - Fallback if the property is missing or not a number
     * @returns {number} The parsed float or the default
     */
    getFloat(name, defaultValue = 0) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        const parsed = parseFloat(raw);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a boolean value with a default fallback.
     * Recognises "true"/"1" as true, "false"/"0" as false.
     * @param {string} name - Property name
     * @param {boolean} defaultValue - Fallback if the property is missing or unrecognised
     * @returns {boolean} The parsed boolean or the default
     */
    getBool(name, defaultValue = false) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        if (raw === 'true' || raw === '1') return true;
        if (raw === 'false' || raw === '0') return false;
        return defaultValue;
    }

    /**
     * Serialize this segment to a URL path fragment.
     * Values are encoded via the provided RouteEncoder (defaults to
     * MinimalRouteEncoder); keys are assumed to be URL-safe identifiers.
     * @param {RouteEncoder} encoder - Encoder for property values
     * @returns {string} URL segment (e.g. "dashboard:id=123;view=grid")
     */
    toString(encoder = defaultEncoder) {
        if (this.#properties.size === 0) return this.#key;
        const pairs = [];
        for (const [k, v] of this.#properties) {
            pairs.push(`${k}=${encoder.encode(v)}`);
        }
        return `${this.#key}:${pairs.join(';')}`;
    }

    /**
     * Parse a URL pathname into an ordered array of RouteSegments.
     * Each path segment is split on the first `:` into key and properties.
     * Properties are `;`-delimited key=value pairs decoded via the
     * provided RouteEncoder (defaults to MinimalRouteEncoder).
     * @param {string} path - URL pathname (e.g. "/dashboard:id=123/table:id=10")
     * @param {RouteEncoder} encoder - Encoder whose decode() reverses the encoding
     * @returns {Array.<RouteSegment>} Ordered list of parsed segments
     */
    static tokenize(path, encoder = defaultEncoder) {
        return path
            .split('/')
            .filter(Boolean)
            .map((raw) => {
                const colonIndex = raw.indexOf(':');
                if (colonIndex === -1) return new RouteSegment(raw);
                const key = raw.substring(0, colonIndex);
                const props = new Map();
                raw.substring(colonIndex + 1)
                    .split(';')
                    .forEach((pair) => {
                        const eq = pair.indexOf('=');
                        if (eq !== -1) {
                            props.set(
                                pair.substring(0, eq),
                                encoder.decode(pair.substring(eq + 1)),
                            );
                        }
                    });
                return new RouteSegment(key, props);
            });
    }
}

/**
 * Default URL-safe encoder used by RouteSegment stringification and parsing.
 * @type {MinimalRouteEncoder}
 */
const defaultEncoder = new MinimalRouteEncoder();
