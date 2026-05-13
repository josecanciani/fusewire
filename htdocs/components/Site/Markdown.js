import { Component } from '../../js/component.js';
import { marked } from 'marked';

/**
 * Markdown renderer component.
 * Fetches markdown content from a URL and renders it as HTML.
 */
export class Markdown extends Component {
    /**
     * src property.
     * @type {string}
     */
    src = '';
    /**
     * htmlContent property.
     * @type {string}
     */
    htmlContent = '';
    /**
     * loading property.
     * @type {boolean}
     */
    loading = true;
    /**
     * error property.
     * @type {string|null}
     */
    error = null;

    /**
     * Whether the component has finished loading and has no errors.
     * @type {boolean}
     */
    get $isReady() {
        return !this.loading && !this.error;
    }

    /**
     * Fetch the markdown content on initialization.
     */
    async init() {
        await this.#fetchContent();
    }

    /**
     * Re-fetch if the source URL changes.
     * @param {import('../../js/component.js').ComponentVars} newVars - New vars
     * @param {boolean} react - Whether to react
     * @returns {Promise<void>}
     */
    async update(newVars, react = true) {
        if (newVars.src && newVars.src !== this.src) {
            this.src = newVars.src;
            await this.#fetchContent();
            if (react) this.react();
            return;
        }
        return super.update(newVars, react);
    }

    /**
     * Fetch markdown and parse it to HTML.
     */
    async #fetchContent() {
        if (!this.src) return;
        this.loading = true;
        this.error = null;
        try {
            const response = await fetch(this.src);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.src}: ${response.statusText}`);
            }
            const text = await response.text();
            this.htmlContent = await marked.parse(text);
        } catch (err) {
            this.error = /** @type {Error} */ (err).message;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Inject HTML content safely into the DOM.
     * Use hydrate() and afterRender() to ensure content is synced.
     */
    hydrate() {
        this.#syncContent();
    }

    /**
     * Sync content after every render.
     */
    afterRender() {
        this.#syncContent();
    }

    /**
     * Internal helper to inject the parsed HTML into the container.
     */
    #syncContent() {
        const container = this.querySelector('.markdown-body');
        if (container && !this.loading && !this.error) {
            // We use innerHTML here as this is a documentation viewer for
            // trusted local content. In a production app, we would use
            // a sanitizer.
            container.innerHTML = this.htmlContent;
        }
    }
}
