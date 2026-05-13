/* eslint-disable jsdoc/no-undefined-types */

/**
 * Variables map passed to a component.
 * @typedef {import('./component.js').ComponentVars} ComponentVars
 */
/**
 * Raw template data fetched from the server.
 * @typedef {Object<string, any>} TemplateData
 * @property {string} version - SHA-256 hash of all files
 * @property {string} htmlCode - Raw HTML template
 * @property {string} cssCode - Scoped CSS code
 * @property {string} jsCode - Component-specific initialization JS (if any)
 * @property {number} fetchedAt - Timestamp of last fetch
 * @property {Object<string, string>} etags - Last ETags for conditional requests
 */
/**
 * Compiled template ready for rendering.
 * @typedef {Object<string, any>} CompiledTemplate
 * @property {string} version - Template version hash
 * @property {string} css - Boxed/scoped CSS
 * @property {function(ComponentVars, import('./component-id.js').ComponentId): string} render - Render function
 */

/**
 * Manages fetching, caching, and versioning of component templates.
 */
export class TemplateStore {
    /**
     * Map of component name to raw template data.
     * @private
     * @type {Map<string, TemplateData>}
     */
    _templates = new Map();

    /**
     * Map of component name to compiled templates.
     * @private
     * @type {Map<string, CompiledTemplate>}
     */
    _compiled = new Map();

    /**
     * Cache for library modules.
     * @private
     * @type {Map<string, any>}
     */
    _libraries = new Map();

    /**
     * Map of in-flight fetch promises.
     * @private
     * @type {Map<string, Promise<TemplateData>>}
     */
    _inFlight = new Map();

    /**
     * Store template data for a component.
     * @param {string} componentName - Component name
     * @param {Partial<TemplateData> & {version: string}} data - Template data
     */
    set(componentName, data) {
        const existingData = this._templates.get(componentName) || {};
        const fullData = {
            htmlCode: '',
            cssCode: '',
            jsCode: '',
            fetchedAt: Date.now(),
            etags: { html: '', css: '', js: '' },
            ...existingData,
            ...data,
        };
        this._templates.set(componentName, fullData);
        // Clear compiled cache when template changes
        this._compiled.delete(componentName);
    }

    /**
     * Check if a template is cached.
     * @param {string} componentName - Component name
     * @returns {boolean} True if cached
     */
    has(componentName) {
        return this._templates.has(componentName);
    }

    /**
     * Get template data for a component.
     * @param {string} componentName - Component name
     * @returns {TemplateData|null} Template data or null
     */
    get(componentName) {
        return this._templates.get(componentName) || null;
    }

    /**
     * Get version hash for a component.
     * @param {string} componentName - Component name
     * @returns {string|null} Version hash or null
     */
    getVersion(componentName) {
        const template = this.get(componentName);
        return template ? template.version : null;
    }

    /**
     * Check if a template is stale.
     * @param {string} componentName - Component name
     * @param {number} ttlMs - Time to live in milliseconds
     * @returns {boolean} True if stale or missing
     */
    isStale(componentName, ttlMs) {
        const template = this.get(componentName);
        if (!template) return true;
        // 0 means never stale
        if (ttlMs === 0) return false;
        return Date.now() - template.fetchedAt > ttlMs;
    }

    /**
     * Remove template for a component.
     * @param {string} componentName - Component name
     */
    clear(componentName) {
        this._templates.delete(componentName);
        this._compiled.delete(componentName);
    }

    /**
     * Store compiled template.
     * @param {string} componentName - Component name
     * @param {CompiledTemplate} compiledTemplate - Compiled template object
     */
    setCompiled(componentName, compiledTemplate) {
        this._compiled.set(componentName, compiledTemplate);
    }

    /**
     * Get compiled template.
     * @param {string} componentName - Component name
     * @returns {CompiledTemplate|null} Compiled template or null
     */
    getCompiled(componentName) {
        return this._compiled.get(componentName) || null;
    }

    /**
     * Clear all templates.
     */
    clearAll() {
        this._templates.clear();
        this._compiled.clear();
        this._inFlight.clear();
        this._libraries.clear();
    }

    /**
     * Fetch template files (HTML, CSS, JS) and compute version hash.
     * All three requests are made in parallel, each with its own ETag for
     * conditional requests. If every file returns 304 Not Modified, fetchedAt
     * is refreshed and the existing template is returned unchanged. When any
     * file has new content, the version hash is recomputed from all three.
     * @param {string} componentName - Component name (e.g., 'Counter', 'Basics/Counter')
     * @param {string} basePath - Base URL path for component files (e.g., './components')
     * @returns {Promise<TemplateData>} Template data with version
     */
    async fetch(componentName, basePath = './components') {
        const existing = this._templates.get(componentName);
        const etags = existing ? existing.etags : { html: '', css: '', js: '' };

        const htmlUrl = `${basePath}/${componentName}.html`;
        const cssUrl = `${basePath}/${componentName}.css`;
        const jsUrl = `${basePath}/${componentName}.js`;

        /**
         * Conditional formatting
         * @param {string} fileEtag - Stored previous
         * @returns {Record<string, any>} Properties dict
         */
        const conditionalHeaders = (fileEtag) =>
            fileEtag ? { headers: { 'If-None-Match': fileEtag } } : {};

        // Fetch all three files in parallel
        const [htmlResponse, cssResponse, jsResponse] = await Promise.all([
            fetch(htmlUrl, conditionalHeaders(etags.html)),
            fetch(cssUrl, conditionalHeaders(etags.css)).catch(
                /**
                 * Catch error and return null.
                 * @returns {Promise<Response|null>} Null value
                 */
                () => Promise.resolve(null),
            ),
            fetch(jsUrl, conditionalHeaders(etags.js)).catch(
                /**
                 * Catch error and return null.
                 * @returns {Promise<Response|null>} Null value
                 */
                () => Promise.resolve(null),
            ),
        ]);

        const htmlNotModified = htmlResponse.status === 304;
        const cssNotModified = cssResponse !== null && cssResponse.status === 304;
        const jsNotModified = jsResponse !== null && jsResponse.status === 304;

        // All 304 — nothing changed, just refresh fetchedAt
        if (htmlNotModified && cssNotModified && jsNotModified && existing) {
            existing.fetchedAt = Date.now();
            return existing;
        }

        // Resolve content: 304 → keep existing, 200 → new content, missing/error → ''
        if (!htmlNotModified && !htmlResponse.ok) {
            throw new Error(
                `Template not found for component "${componentName}" (HTTP ${htmlResponse.status})`,
            );
        }
        const htmlCode =
            htmlNotModified && existing ? existing.htmlCode : await htmlResponse.text();
        const cssCode =
            cssNotModified && existing
                ? existing.cssCode
                : cssResponse !== null && cssResponse.ok
                  ? await cssResponse.text()
                  : '';
        const jsCode =
            jsNotModified && existing
                ? existing.jsCode
                : jsResponse !== null && jsResponse.ok
                  ? await jsResponse.text()
                  : '';

        // Preserve ETags: use new ETag from response, or keep existing
        const newEtags = {
            html: htmlResponse.headers.get('etag') || etags.html,
            css: cssResponse !== null ? cssResponse.headers.get('etag') || etags.css : etags.css,
            js: jsResponse !== null ? jsResponse.headers.get('etag') || etags.js : etags.js,
        };

        const version = await this.computeHash(htmlCode + cssCode + jsCode);
        const fetchedAt = Date.now();

        this.set(componentName, { version, htmlCode, cssCode, jsCode, fetchedAt, etags: newEtags });

        return { version, htmlCode, cssCode, jsCode, fetchedAt, etags: newEtags };
    }

    /**
     * Request a template with in-flight deduplication.
     * If the template is already cached, resolves immediately. If a fetch for
     * this component is already in progress, returns the same promise (no
     * duplicate request). Otherwise starts a new fetch.
     * @param {string} componentName - Component name
     * @param {string} basePath - Base URL path for component files
     * @returns {Promise<TemplateData>} Template data
     */
    async requestTemplate(componentName, basePath = './components') {
        if (this.has(componentName)) {
            return this.get(componentName);
        }
        if (this._inFlight.has(componentName)) {
            return this._inFlight.get(componentName);
        }
        const promise = this.fetch(componentName, basePath).finally(() => {
            this._inFlight.delete(componentName);
        });
        this._inFlight.set(componentName, promise);
        return promise;
    }

    /**
     * Request a library ES module with caching.
     * @param {string} name - Library identifier
     * @param {string} url - Full URL to load
     * @returns {Promise<any>} The module exports
     */
    async requestLibrary(name, url) {
        if (this._libraries.has(name)) {
            return this._libraries.get(name);
        }
        const promise = import(url).then((module) => {
            this._libraries.set(name, module);
            return module;
        });
        this._libraries.set(name, promise);
        return promise;
    }

    /**
     * Get a previously loaded library synchronously.
     * @param {string} name - Library identifier
     * @returns {Object<string, any>|null} The module exports
     */
    getLibrarySync(name) {
        const lib = this._libraries.get(name);
        if (lib instanceof Promise) {
            throw new Error(`Library ${name} is still loading`);
        }
        return lib || null;
    }

    /**
     * Compute SHA-256 hash of content (first 12 hex chars).
     * @param {string} content - Content to hash
     * @returns {Promise<string>} Hash string (12 hex chars)
     */
    async computeHash(content) {
        // Use Web Crypto API (available in browser and Node 18+)
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            // Fallback for environment without Web Crypto
            return Math.random().toString(36).substring(2, 14);
        }

        const msgUint8 = new TextEncoder().encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        return hashHex.substring(0, 12);
    }
}
