import { Component } from '../../js/component.js';

/**
 * Documentation viewer component.
 * Manages the sidebar and the active document being displayed.
 */
export class Docs extends Component {
    /**
     * doc property.
     * @type {string}
     */
    doc = 'fusewire-vs-other-frameworks';

    /**
     * List of available documentation files.
     * @type {Array.<{id: string, title: string}>}
     */
    docsList = [
        { id: 'fusewire-vs-other-frameworks', title: 'FuseWire vs Others' },
        { id: 'architecture', title: 'Architecture' },
        { id: 'css-scoping', title: 'CSS Scoping & Theming' },
        { id: 'lifecycle', title: 'Lifecycle' },
        { id: 'template-syntax', title: 'Template Syntax' },
        { id: 'history-router', title: 'History Router' },
        { id: 'render-optimization', title: 'Render Optimization' },
        { id: 'parallel-creation', title: 'Parallel Creation' },
        { id: 'portals', title: 'Portals' },
        { id: 'persistence', title: 'Persistence' },
        { id: 'errors', title: 'Error Handling' },
    ];

    /**
     * markdownViewer property.
     * @type {import('./Markdown.js').Markdown|null}
     */
    markdownViewer = null;

    /**
     * The full path to the currently active markdown document.
     * @returns {string} The full path to the active document
     */
    get $activeDoc() {
        return `./docs/${this.doc}.md`;
    }

    /**
     * Derived list of documents with active class applied.
     * @type {Array.<{id: string, title: string, $activeClass: string}>}
     */
    get $docsList() {
        return this.docsList.map((doc) => ({
            ...doc,
            $activeClass: doc.id === this.doc ? 'active' : '',
        }));
    }

    /**
     * Initialize the docs and load the requested document from the URL.
     * @param {Object<string, *>|null} previousState - State from previous destroy()
     * @param {import('../../js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     */
    async init(previousState, routeSegment) {
        if (routeSegment) {
            this.doc = routeSegment.getString('doc') || 'fusewire-vs-other-frameworks';
        }
        this.#loadMarkdown();
    }

    /**
     * Handle back/forward navigation.
     * @param {import('../../js/component.js').ComponentVars} newVars - Vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('../../js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     * @returns {Promise<void>}
     */
    async update(newVars, react = true, routeSegment = null) {
        await super.update(newVars, react, routeSegment);
        if (routeSegment) {
            // Document might have changed via URL
            if (this.markdownViewer) {
                this.markdownViewer.update({ src: `./docs/${this.doc}.md` });
            }
        }
    }

    /**
     * Expose 'doc' to the URL.
     * @returns {Object<string, string>} Route state
     */
    routeState() {
        return { doc: this.doc };
    }

    /**
     * Select a document to view.
     * @param {string} id - Document ID (filename without .md)
     */
    selectDoc(id) {
        if (this.doc === id) return;
        this.doc = id;
        if (this.markdownViewer) {
            this.markdownViewer.update({ src: `./docs/${this.doc}.md` });
        }
        this.react().then(() => this.pushRoute());
    }

    /**
     * Instantiate the Markdown viewer for the current document.
     */
    #loadMarkdown() {
        this.markdownViewer = this.createChild('Site/Markdown', 'viewer', {
            src: this.$activeDoc,
        });
    }
}
