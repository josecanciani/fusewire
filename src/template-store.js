/** @typedef {import('./template-compiler.js').CompiledTemplate} CompiledTemplate */

/**
 * @typedef {{
 *   version: string,
 *   htmlCode: string,
 *   cssCode: string,
 *   jsCode: string,
 *   fetchedAt: number,
 *   etags: { html: string, css: string, js: string }
 * }} TemplateData
 */

/**
 * In-memory template storage with content-hash versioning.
 * Stores HTML, CSS, JS source, and compiled templates for components.
 * Supports conditional fetching via ETags and staleness checks.
 */
export class TemplateStore {
  constructor() {
    this._templates = new Map();
    this._compiled = new Map();
  }

  /**
   * Store a template for a component
   * @param {string} componentName - Component name
   * @param {TemplateData} template - Template data
   */
  set(
    componentName,
    {
      version,
      htmlCode,
      cssCode = '',
      jsCode = '',
      fetchedAt = 0,
      etags = { html: '', css: '', js: '' },
    },
  ) {
    this._templates.set(componentName, {
      version,
      htmlCode,
      cssCode,
      jsCode,
      fetchedAt: fetchedAt || Date.now(),
      etags,
    });
    // Clear compiled cache when template changes
    this._compiled.delete(componentName);
  }

  /**
   * Get template data for a component
   * @param {string} componentName - Component name
   * @returns {TemplateData|null} Template data or null if not found
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
   * @returns {boolean} True if template exists
   */
  has(componentName) {
    return this._templates.has(componentName);
  }

  /**
   * Check if a stored template is stale (older than the given TTL)
   * @param {string} componentName - Component name
   * @param {number} ttlMs - Maximum age in milliseconds (0 = never stale)
   * @returns {boolean} True if template is stale or not found
   */
  isStale(componentName, ttlMs) {
    if (ttlMs === 0) return false;
    const template = this._templates.get(componentName);
    if (!template) return true;
    return Date.now() - template.fetchedAt > ttlMs;
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
   * @param {CompiledTemplate} compiledTemplate - Compiled template object
   */
  setCompiled(componentName, compiledTemplate) {
    this._compiled.set(componentName, compiledTemplate);
  }

  /**
   * Get compiled template
   * @param {string} componentName - Component name
   * @returns {CompiledTemplate|null} Compiled template or null
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

    const conditionalHeaders = (fileEtag) =>
      fileEtag ? { headers: { 'If-None-Match': fileEtag } } : {};

    // Fetch all three files in parallel
    const [htmlResponse, cssResponse, jsResponse] = await Promise.all([
      fetch(htmlUrl, conditionalHeaders(etags.html)),
      fetch(cssUrl, conditionalHeaders(etags.css)).catch(() => null),
      fetch(jsUrl, conditionalHeaders(etags.js)).catch(() => null),
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
    const htmlCode = htmlNotModified && existing ? existing.htmlCode : await htmlResponse.text();
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
   * Compute SHA-256 hash of content (first 12 hex chars)
   * @param {string} content - Content to hash
   * @returns {Promise<string>} Hash string (12 hex chars)
   */
  async computeHash(content) {
    // Use Web Crypto API (available in browser and Node 18+)
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API not available. Requires modern browser or Node.js 18+');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 12);
  }
}
