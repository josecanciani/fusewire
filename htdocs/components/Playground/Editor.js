import { Component } from '/js/component.js';
// @ts-ignore — CDN imports resolve at runtime in the browser
import { EditorView, basicSetup } from 'https://esm.sh/codemirror';
// @ts-ignore
import { html } from 'https://esm.sh/@codemirror/lang-html';
// @ts-ignore
import { css } from 'https://esm.sh/@codemirror/lang-css';
// @ts-ignore
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript';
// @ts-ignore
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark';

export class Editor extends Component {
    /** @type {Array.<object>} */
    openTabs = [];
    /** @type {string|null} */
    activeTabId = null;
    /** @type {Array.<object>} */
    initialFiles = [];

    #editorView = null;
    #files = [];
    #tabContents = new Map();
    #darkMode = false;

    /**
     * Open the first file as the initial tab and listen for theme broadcasts
     */
    async init() {
        this.#files = this.initialFiles;
        this.#tabContents = new Map(this.#files.map((f) => [f.id, f.content]));

        this.on('theme', (theme) => this.#applyTheme(theme));

        if (this.#files.length > 0) {
            const first = this.#files[0];
            this.openTabs = [
                { id: first.id, label: first.label, ext: first.ext, activeClass: 'active' },
            ];
            this.activeTabId = first.id;
        }
    }

    /**
     * Replace all files and reset tab state. Opens the first file automatically.
     * @param {Array.<{id: string, label: string, ext: string, content: string}>} files - New file set
     */
    loadFiles(files) {
        this.#destroyEditorView();
        this.#files = files;
        this.#tabContents = new Map(files.map((f) => [f.id, f.content]));

        if (files.length > 0) {
            const first = files[0];
            this.openTabs = [
                { id: first.id, label: first.label, ext: first.ext, activeClass: 'active' },
            ];
            this.activeTabId = first.id;
        } else {
            this.openTabs = [];
            this.activeTabId = null;
        }

        this.react();
        this.emit('activeFileChanged', this.activeTabId);
    }

    /**
     * Open a file as a new tab, or switch to it if already open.
     * @param {string} id - File identifier
     */
    openFile(id) {
        const existing = this.openTabs.find((t) => t.id === id);
        if (existing) {
            if (this.activeTabId !== id) this.#switchTo(id);
            return;
        }
        this.#saveEditorContent();
        const file = this.#files.find((f) => f.id === id);
        this.openTabs.forEach((t) => {
            t.activeClass = '';
        });
        this.openTabs.push({ id, label: file.label, ext: file.ext, activeClass: 'active' });
        this.#switchTo(id);
    }

    /**
     * Switch to an already-open tab.
     * @param {string} id - Tab identifier
     */
    switchTab(id) {
        if (this.activeTabId === id) return;
        this.#switchTo(id);
    }

    /**
     * Close an open tab.
     * @param {string} id - Tab identifier
     */
    closeTab(id) {
        const idx = this.openTabs.findIndex((t) => t.id === id);
        if (idx === -1) return;

        if (this.activeTabId === id) this.#saveEditorContent();
        this.openTabs.splice(idx, 1);

        if (this.activeTabId !== id) {
            this.react();
            return;
        }

        if (this.openTabs.length > 0) {
            const next = this.openTabs[Math.min(idx, this.openTabs.length - 1)];
            next.activeClass = 'active';
            this.#switchTo(next.id);
        } else {
            this.#destroyEditorView();
            this.activeTabId = null;
            this.react();
            this.emit('activeFileChanged', null);
        }
    }

    /**
     * Get all file contents, reflecting any unsaved editor changes.
     * @returns {Map.<string, string>} File id to content
     */
    getContents() {
        this.#saveEditorContent();
        return this.#tabContents;
    }

    /**
     * Emit runDemo event to parent.
     */
    runDemo() {
        this.emit('runDemo');
    }

    /**
     * Destroy the CodeMirror editor view
     */
    destroy() {
        this.#destroyEditorView();
    }

    /**
     * Mount the CodeMirror editor on first render
     */
    hydrate() {
        if (this.activeTabId) {
            this.#mountEditor();
        }
    }

    /**
     * Re-mount the CodeMirror editor if morphing cleared the editor area
     */
    afterRender() {
        if (this.activeTabId && !this.#editorView) {
            this.#mountEditor();
        }
    }

    /**
     * Re-mount CodeMirror if a parent re-render caused morphing to clear
     * the editor area. Safe to call at any time — it is a no-op when the
     * editor DOM is still intact.
     */
    restoreEditorView() {
        if (!this.activeTabId || !this.#editorView) return;
        const container = this.querySelector('.fw-editor-area');
        if (container && container.children.length === 0) {
            this.#saveEditorContent();
            this.#destroyEditorView();
            this.#mountEditor();
        }
    }

    #switchTo(id) {
        this.#saveEditorContent();
        this.#destroyEditorView();
        this.openTabs.forEach((t) => {
            t.activeClass = t.id === id ? 'active' : '';
        });
        this.activeTabId = id;
        this.react();
        this.emit('activeFileChanged', id);
    }

    #saveEditorContent() {
        if (this.activeTabId && this.#editorView) {
            this.#tabContents.set(this.activeTabId, this.#editorView.state.doc.toString());
        }
    }

    #mountEditor() {
        const container = this.querySelector('.fw-editor-area');
        if (!container) return;
        const tab = this.openTabs.find((t) => t.id === this.activeTabId);
        const content = this.#tabContents.get(this.activeTabId);
        const fontTheme = EditorView.theme({ '&': { fontSize: '12px' } });
        const noGrammarly = EditorView.contentAttributes.of({
            'data-gramm': 'false',
            'data-gramm_editor': 'false',
            'data-enable-grammarly': 'false',
        });
        const extensions = [basicSetup, fontTheme, noGrammarly, this.#langExtension(tab.ext)];
        if (this.#darkMode) extensions.push(oneDark);
        this.#editorView = new EditorView({
            doc: content,
            extensions,
            parent: container,
        });
    }

    #destroyEditorView() {
        if (!this.#editorView) return;
        this.#editorView.destroy();
        this.#editorView = null;
    }

    /**
     * Switch the editor between dark and light CodeMirror themes.
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    #applyTheme(theme) {
        this.#darkMode = theme === 'dark';
        if (!this.#editorView) return;
        this.#saveEditorContent();
        this.#destroyEditorView();
        this.#mountEditor();
    }

    #langExtension(ext) {
        if (ext === 'html') return html();
        if (ext === 'css') return css();
        return javascript();
    }
}
