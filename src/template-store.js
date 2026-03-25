/**
 * In-memory template storage with content-hash versioning
 * Stores HTML, CSS, and compiled templates for components
 */
export class TemplateStore {
    constructor() {
        this._templates = new Map();
        this._compiled = new Map();
    }

    /**
     * Store a template for a component
     * @param {string} componentName - Component name
     * @param {Object} template - Template data
     * @param {string} template.version - Content hash version
     * @param {string} template.htmlCode - HTML template code
     * @param {string} [template.cssCode] - CSS code (optional)
     * @param {string} [template.jsUrl] - JS module URL (optional)
     */
    set(componentName, { version, htmlCode, cssCode = '', jsUrl = '' }) {
        this._templates.set(componentName, {
            version,
            htmlCode,
            cssCode,
            jsUrl,
        });
        // Clear compiled cache when template changes
        this._compiled.delete(componentName);
    }

    /**
     * Get template data for a component
     * @param {string} componentName - Component name
     * @returns {Object|null} Template data or null if not found
     */
    get(componentName) {
        return this._templates.get(componentName) || null;
    }

    /**
     * Get version for a component
     * @param {string} componentName - Component name
     * @returns {string|null} Version hash or null if not found
     */
    getVersion(componentName) {
        const template = this._templates.get(componentName);
        return template ? template.version : null;
    }

    /**
     * Check if template exists for a component
     * @param {string} componentName - Component name
     * @returns {boolean}
     */
    has(componentName) {
        return this._templates.has(componentName);
    }

    /**
     * Remove template for a component
     * @param {string} componentName - Component name
     */
    clear(componentName) {
        this._templates.delete(componentName);
        this._compiled.delete(componentName);
    }

    /**
     * Store compiled template
     * @param {string} componentName - Component name
     * @param {Object} compiledTemplate - Compiled template object
     */
    setCompiled(componentName, compiledTemplate) {
        this._compiled.set(componentName, compiledTemplate);
    }

    /**
     * Get compiled template
     * @param {string} componentName - Component name
     * @returns {Object|null} Compiled template or null
     */
    getCompiled(componentName) {
        return this._compiled.get(componentName) || null;
    }

    /**
     * Clear all templates
     */
    clearAll() {
        this._templates.clear();
        this._compiled.clear();
    }

    /**
     * Fetch template files and compute version hash
     * @param {string} componentName - Component name
     * @param {string} basePath - Base path for component files (e.g., '/components')
     * @returns {Promise<Object>} Template data with version
     */
    async fetch(componentName, basePath = '/components') {
        // Fetch HTML, CSS, and JS files
        const htmlUrl = `${basePath}/${componentName}.html`;
        const cssUrl = `${basePath}/${componentName}.css`;
        const jsUrl = `${basePath}/${componentName}.js`;

        const [htmlCode, cssCode, jsCode] = await Promise.all([
            fetch(htmlUrl).then((r) => r.text()),
            fetch(cssUrl)
                .then((r) => r.text())
                .catch(() => ''), // CSS is optional
            fetch(jsUrl)
                .then((r) => r.text())
                .catch(() => ''), // JS might be pre-loaded as module
        ]);

        // Compute version hash from all content
        const version = await this._computeHash(htmlCode + cssCode + jsCode);

        // Store template
        this.set(componentName, {
            version,
            htmlCode,
            cssCode,
            jsUrl,
        });

        return { version, htmlCode, cssCode, jsUrl };
    }

    /**
     * Compute SHA-256 hash of content (first 12 chars)
     * @private
     * @param {string} content - Content to hash
     * @returns {Promise<string>} Hash string (12 hex chars)
     */
    async _computeHash(content) {
        // Use Web Crypto API (available in browser and Node 18+)
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            throw new Error(
                'Web Crypto API not available. Requires modern browser or Node.js 18+',
            );
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        return hashHex.substring(0, 12);
    }
}
