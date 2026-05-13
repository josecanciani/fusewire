import { Component } from '../../js/component.js';
// @ts-ignore
import { EditorView, basicSetup } from 'codemirror';
// @ts-ignore
import { html } from '@codemirror/lang-html';
// @ts-ignore
import { css } from '@codemirror/lang-css';
// @ts-ignore
import { javascript } from '@codemirror/lang-javascript';
// @ts-ignore
import { oneDark } from '@codemirror/theme-one-dark';

/**
 * Code editor panel using CodeMirror; manages tabbed files and theme switching.
 */
export class Editor extends Component {
    /**
     * List of currently open file tabs.
     * @type {Array.<{id: string, label: string, ext: string, activeClass: string}>}
     */
    openTabs = [];
    /**
     * The ID of the currently active tab.
     * @type {string|null}
     */
    activeTabId = null;
    /**
     * Files to populate the editor.
     * @type {Array.<object>}
     */
    files = [];
    /**
     * The ID of the file to be opened initially or currently active from parent.
     * @type {string|null}
     */
    activeFileId = null;

    /**
     * The CodeMirror EditorView instance.
     * @type {{state: {doc: {toString(): string}}, destroy(): void} | null}
     */
    #editorView = null;
    #tabContents = new Map();
    #darkMode = false;

    /**
     * Open the first file as the initial tab and listen for theme broadcasts
     * @param {Object<string, *>|null} previousState - Previous state to restore
     */
    async init(previousState) {
        if (previousState) {
            this.files = previousState.files;
            this.#tabContents = new Map(previousState.tabContents);
            this.openTabs = previousState.openTabs;
            this.activeTabId = previousState.activeTabId;
        } else {
            this.#tabContents = new Map(this.files.map((f) => [f.id, f.content]));

            const activeId = this.activeFileId || (this.files.length > 0 ? this.files[0].id : null);
            if (activeId) {
                const file = this.files.find((f) => f.id === activeId);
                if (file) {
                    this.openTabs = [
                        {
                            id: file.id,
                            label: file.label,
                            ext: file.ext,
                            activeClass: 'active',
                        },
                    ];
                    this.activeTabId = file.id;
                }
            }
        }

        this.on('theme', (theme) => this.#applyTheme(theme));
    }

    /**
     * Handle updates from parent components.
     * @param {import('../../js/component.js').ComponentVars} newVars - New vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('../../js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     */
    update(newVars, react = true, routeSegment = null) {
        const oldFiles = this.files;
        const shouldProcessFiles = newVars.files !== undefined && newVars.files !== oldFiles;

        if (shouldProcessFiles) {
            this.#saveEditorContent();
            this.#destroyEditorView();
        }

        super.update(newVars, react && !shouldProcessFiles, routeSegment);

        if (shouldProcessFiles) {
            this.#loadFilesInternal(this.files, this.activeFileId);
            if (react) this.react();
        }
    }

    /**
     * Replace all files and reset tab state. Opens the specified file or the first file automatically.
     * @param {Array.<{id: string, label: string, ext: string, content: string}>} files - New file set
     * @param {string} [activeFileId] - Optional file ID to open
     */
    #loadFilesInternal(files, activeFileId) {
        this.#destroyEditorView();
        this.#tabContents = new Map(files.map((f) => [f.id, f.content]));

        const activeId = activeFileId || (files.length > 0 ? files[0].id : null);
        if (activeId) {
            const file = files.find((f) => f.id === activeId);
            if (file) {
                this.openTabs = [
                    {
                        id: file.id,
                        label: file.label,
                        ext: file.ext,
                        activeClass: 'active',
                    },
                ];
                this.activeTabId = file.id;
            } else {
                this.openTabs = [];
                this.activeTabId = null;
            }
        } else {
            this.openTabs = [];
            this.activeTabId = null;
        }

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
        const file = this.files.find((f) => f.id === id);
        this.openTabs.forEach((t) => {
            t.activeClass = '';
        });
        this.openTabs.push({
            id,
            label: file.label,
            ext: file.ext,
            activeClass: 'active',
        });
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
            this.emit('activeFileChanged', null);
            this.react();
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
     * @returns {Object<string, *>} Preserved state
     */
    destroy() {
        this.#saveEditorContent();
        this.#destroyEditorView();
        return {
            files: this.files,
            tabContents: Array.from(this.#tabContents.entries()),
            openTabs: this.openTabs,
            activeTabId: this.activeTabId,
        };
    }

    /**
     * Mount the CodeMirror editor on first render
     */
    hydrate() {
        console.log('Editor hydrate: activeTabId=', this.activeTabId);
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

    /**
     * Persist editor content, destroy the current view, switch active tab, and re-mount editor.
     * @param {string} id - Tab identifier to switch to
     */
    #switchTo(id) {
        this.#saveEditorContent();
        this.#destroyEditorView();
        this.openTabs.forEach((t) => {
            t.activeClass = t.id === id ? 'active' : '';
        });
        this.activeTabId = id;
        this.emit('activeFileChanged', id);
        this.react();
    }

    /**
     * Save the current editor text into the tab contents map.
     */
    #saveEditorContent() {
        if (this.activeTabId && this.#editorView) {
            this.#tabContents.set(this.activeTabId, this.#editorView.state.doc.toString());
        }
    }

    /**
     * Mount the CodeMirror editor instance into the DOM area.
     */
    #mountEditor() {
        try {
            this.#destroyEditorView();
            const container = this.querySelector('.fw-editor-area');
            if (!container) {
                console.warn('[Editor] Area not found for mount');
                return;
            }
            const tab = this.openTabs.find((t) => t.id === this.activeTabId);
            if (!tab) {
                console.warn('[Editor] Active tab not found:', this.activeTabId);
                return;
            }

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
            console.log('[Editor] Mounted CodeMirror for', this.activeTabId);
        } catch (err) {
            console.error('[Editor] Failed to mount CodeMirror:', err.message);
        }
    }

    /**
     * Destroy the current CodeMirror EditorView and clear the reference.
     */
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

    /**
     * Return the CodeMirror language extension for a given file extension.
     * @param {string} ext - File extension ('html', 'css', or anything else for JavaScript)
     * @returns {import('@codemirror/state').Extension} CodeMirror language extension
     */
    #langExtension(ext) {
        const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
        if (cleanExt === 'html') return html();
        if (cleanExt === 'css') return css();
        return javascript();
    }
}
