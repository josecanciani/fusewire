import { Component } from '/js/component.js';
import { REACTOR } from '/js/symbols.js';

/**
 * @typedef {Object<string, *>} Demo
 * @property {string} name - Component name
 * @property {string[]} [tags] - Filtering tags
 * @property {Object.<string, *>} [vars] - Initial vars for the demo
 * @property {string[]} [components] - Additional components to include
 * @property {string} [activeClass] - UI active state
 * @property {string} [defaultFile] - The ID of the file to open by default (e.g., 'Counter/js')
 */

/**
 * Main playground component — manages demo selection, sidebar, code editor, and console panel.
 */
export class Home extends Component {
    /** @type {Array.<Demo>} */
    demos = [];
    /** @type {Array.<Demo>} */
    filteredDemos = [];
    /** @type {boolean} */
    noResults = false;
    /** @type {string|null} */
    selectedDemo = null;
    /** @type {number} */
    demoRunId = 0;
    /** @type {import('/js/component.js').ErrorBoundary|null} */
    demoComponent = null;
    /** @type {import('../Console/Panel.js').Panel} */
    consoleComponent = null;
    /** @type {import('./Sidebar.js').Sidebar} */
    sidebarComponent = null;
    /** @type {import('./Editor.js').Editor} */
    editorComponent = null;
    /** @type {import('./TagFilter.js').TagFilter} */
    tagFilterComponent = null;
    /** @type {import('./Header.js').Header} */
    headerComponent = null;

    /** @type {{cancel(): void, size: number} | null} */
    #rightPaneResizeState = null;
    /** @type {{cancel(): void, size: number} | null} */
    #consoleResizeState = null;
    /** @type {function(MouseEvent, HTMLElement, object): {cancel(): void, size: number} | null} */
    #startHorizontalResize = null;
    /** @type {function(MouseEvent, HTMLElement, object): {cancel(): void, size: number} | null} */
    #startVerticalResize = null;
    /** @type {boolean} */
    sidebarHidden = false;
    /** @type {string} */
    sidebarDisplayClass = '';

    /**
     * Initialize the playground with a header, tag filter and console panel.
     * When a HistoryRouter is active, reads the demo name from the URL
     * segment and auto-selects it before the first render (no flash).
     * @param {Object<string, *>|null} previousState - State from previous destroy(), or null
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment, or null
     */
    async init(previousState, routeSegment) {
        this.filteredDemos = this.demos;
        this.loadLibrary('Lib/Resize');
        this.headerComponent = /** @type {import('./Header.js').Header} */ (
            this.createChild('Playground/Header', 'header', { theme: 'light' })
        );
        this.headerComponent.on('changeTheme', (theme) => this.#applyTheme(theme));

        const allTags = [...new Set(this.demos.flatMap((d) => d.tags))];
        this.tagFilterComponent = /** @type {import('./TagFilter.js').TagFilter} */ (
            this.createChild('Playground/TagFilter', 'tags', {
                tags: allTags.map((name) => ({ name, activeClass: '' })),
            })
        );
        this.tagFilterComponent.on('change', (tags) => this.filterByTag(tags));

        if (routeSegment) {
            const title = routeSegment.getString('demo');
            const demo = this.demos.find((d) => d.title === title);
            if (demo) {
                await this.#loadDemo(demo.name);
            }
        }
    }

    /**
     * Load the horizontal resize library and initialize the handler.
     */
    hydrate() {
        const resizeLib = this.library('Lib/Resize');
        this.#startHorizontalResize =
            /** @type {typeof import('../Lib/Resize.js').startHorizontalResize} */ (
                resizeLib.startHorizontalResize
            );
        this.#startVerticalResize =
            /** @type {typeof import('../Lib/Resize.js').startVerticalResize} */ (
                resizeLib.startVerticalResize
            );
    }

    /**
     * Declare the selected demo as the Home component's URL contribution.
     * Uses the demo title (human-readable, no slashes) instead of the
     * component path to produce clean URLs.
     * @returns {Object<string, string>} Route state with the current demo title
     */
    routeState() {
        const demo = this.demos.find((d) => d.name === this.selectedDemo);
        return { demo: demo ? demo.title : '' };
    }

    /**
     * Handle URL changes (browser back/forward) by reading the demo title
     * from the route segment and navigating accordingly.
     * @param {import('/js/component.js').ComponentVars} newVars - Vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment during popstate
     * @returns {Promise<void>} Resolves when the state change is complete
     */
    update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            const title = routeSegment.getString('demo');
            const demo = this.demos.find((d) => d.title === title);
            const name = demo ? demo.name : '';
            if (name && name !== this.selectedDemo) {
                this.#loadDemo(name).then(() => this.react());
                return Promise.resolve();
            }
            if (!name && this.selectedDemo) {
                this.#backWithoutPush();
                return Promise.resolve();
            }
        }
        return super.update(newVars, react, routeSegment);
    }

    /**
     * Filter demos by active tags (AND — demo must have all selected tags).
     * Empty array means show all.
     * @param {Array.<string>} tags - Active tag names
     */
    filterByTag(tags) {
        this.filteredDemos =
            tags.length > 0
                ? this.demos.filter((d) => tags.every((t) => d.tags.includes(t)))
                : this.demos;
        this.noResults = this.filteredDemos.length === 0;
        this.react();
    }

    /**
     * Select and load a demo by name, pushing a new history entry.
     * Use this for user-initiated navigation (sidebar click, etc.).
     * pushRoute() runs first to create the history entry, then react()
     * mounts children and replaceRoute() enriches the URL with their state.
     * @param {string} name - Demo name
     */
    async selectDemo(name) {
        if (await this.#loadDemo(name)) {
            this.pushRoute();
            this.react().then(() => this.replaceRoute());
        }
    }

    /**
     * Core demo-loading logic. Creates child components, fetches source
     * files, and wires up the sidebar/editor — but does NOT push a URL
     * or trigger a render. Callers decide whether to push/react.
     * @param {string} name - Demo name
     * @returns {Promise.<boolean>} true if the demo was loaded, false if skipped
     */
    async #loadDemo(name) {
        const demo = this.demos.find((d) => d.name === name);
        if (!demo) return false;
        if (this.selectedDemo === name) return false;

        const files = await this.#fetchDemoFiles(demo);
        const defaultFileId = demo.defaultFile || files[0]?.id;

        const demoFiles = files.map((f) => ({
            id: f.id,
            label: f.label,
            activeClass: f.id === defaultFileId ? 'active' : '',
        }));

        this.demos.forEach((d) => {
            d.activeClass = d.name === name ? 'active' : '';
        });

        this.selectedDemo = name;
        this.demoRunId = Date.now();

        this.demoComponent = /** @type {import('/js/component.js').ErrorBoundary} */ (
            this.createErrorBoundedChild(
                this.createChild(demo.name, `demo-${this.demoRunId}`, demo.vars || {}),
                'Playground/DemoFallback',
            )
        );

        if (this.sidebarComponent) {
            this.sidebarComponent.update({ demos: this.demos, demoFiles });
            this.editorComponent.loadFiles(files, defaultFileId);
        } else {
            this.sidebarComponent = /** @type {import('./Sidebar.js').Sidebar} */ (
                this.createChild('Playground/Sidebar', 'sidebar', {
                    demos: this.demos,
                    demoFiles,
                })
            );
            this.sidebarComponent.on('selectDemo', (name) => {
                this.selectDemo(name);
            });
            this.sidebarComponent.on('openFile', (id) => this.editorComponent.openFile(id));
            this.sidebarComponent.on('back', () => this.back());

            this.editorComponent = /** @type {import('./Editor.js').Editor} */ (
                this.createChild('Playground/Editor', 'editor', {
                    initialFiles: files,
                    initialFileId: defaultFileId,
                })
            );
            this.editorComponent.on('runDemo', () => {
                this.runDemo();
            });
            this.editorComponent.on('activeFileChanged', (id) =>
                this.sidebarComponent.highlightFile(id),
            );
            this.consoleComponent = /** @type {import('../Console/Panel.js').Panel} */ (
                this.createChild('Console/Panel', 'console', { logs: [] })
            );
        }

        return true;
    }

    /**
     * Re-import edited source code and re-create the demo component.
     */
    async runDemo() {
        if (!this.selectedDemo) return;
        const demo = this.demos.find((d) => d.name === this.selectedDemo);
        const contents = this.editorComponent.getContents();
        const templateStore = this[REACTOR]._templateStore;
        const registry = this[REACTOR]._instanceRegistry;
        const components = demo.components || [demo.name];
        try {
            for (const componentName of components) {
                const htmlCode = contents.get(`${componentName}/html`);
                const cssCode = contents.get(`${componentName}/css`);
                const jsCode = contents.get(`${componentName}/js`);
                const version = await templateStore.computeHash(htmlCode + cssCode);
                templateStore.set(componentName, { version, htmlCode, cssCode });
                // Absolute paths like '/js/...' don't resolve from blob URLs,
                // so rewrite them to full URLs using the current page's base URL.
                const baseUrl = new URL('./', window.location.href).href;
                const resolvedJs = jsCode.replace(/(from\s+['"])\//g, `$1${baseUrl}`);
                const blob = new Blob([resolvedJs], { type: 'text/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                try {
                    const module = await import(blobUrl);
                    const simpleName = componentName.includes('/')
                        ? componentName.split('/').pop()
                        : componentName;
                    const ComponentClass =
                        module[simpleName] || module[componentName] || module.default;
                    if (ComponentClass) {
                        registry.registerComponent(componentName, ComponentClass);
                    }
                } finally {
                    URL.revokeObjectURL(blobUrl);
                }
            }
            // Explicitly tear down the old demo instance before spawning the new one.
            // This ensures any fixed-id inner components are deregistered and
            // explicitly recreated from scratch rather than preserved as zombies.
            if (this.demoComponent) {
                // remove() synchronously deletes from _instances immediately
                registry.remove(this.demoComponent.toComponentId());
            }

            // We increment runId so the top-level parent gets a unique instance id.
            this.demoRunId = Date.now();
            this.demoComponent = /** @type {import('/js/component.js').ErrorBoundary} */ (
                this.createErrorBoundedChild(
                    this.createChild(demo.name, `demo-${this.demoRunId}`, {}),
                    'Playground/DemoFallback',
                )
            );
            this.react();
        } catch (err) {
            this.console.error(`Run failed: ${/** @type {Error} */ (err).message}`);
        }
    }

    /**
     * Navigate back to the demo list and push a new history entry.
     */
    back() {
        this.#resetDemoState();
        this.pushRoute();
        this.react();
    }

    /**
     * Internal back logic without URL push — used by the popstate handler
     * to avoid pushing a duplicate history entry when the browser already
     * navigated back.
     */
    #backWithoutPush() {
        this.#resetDemoState();
        this.react();
    }

    /**
     * Clear all demo-related state: resize handlers, sidebar, editor, and
     * the active demo selection. Does not trigger a render or URL update.
     */
    #resetDemoState() {
        if (this.#rightPaneResizeState) this.#rightPaneResizeState.cancel();
        if (this.#consoleResizeState) this.#consoleResizeState.cancel();
        this.#rightPaneResizeState = null;
        this.#consoleResizeState = null;
        this.sidebarHidden = false;
        this.sidebarDisplayClass = '';
        this.selectedDemo = null;
        this.demoComponent = null;
        this.sidebarComponent = null;
        this.editorComponent = null;
        this.consoleComponent = null;
        this.demos.forEach((d) => {
            d.activeClass = '';
        });
    }

    /**
     * Toggles the sidebar visibility.
     */
    toggleSidebar() {
        this.sidebarHidden = !this.sidebarHidden;
        this.sidebarDisplayClass = this.sidebarHidden ? 'd-none' : '';
        this.react();
    }

    /**
     * Start a horizontal resize drag on the right pane.
     * @param {MouseEvent} e - The mousedown event
     */
    startResize(e) {
        const rightPane = this.querySelector('.right-pane');
        this.#rightPaneResizeState = this.#startHorizontalResize(e, rightPane, {
            direction: -1,
            minSize: 200,
        });
    }

    /**
     * Start a vertical resize drag on the console panel.
     * @param {MouseEvent} e - The mousedown event
     */
    startConsoleResize(e) {
        const consoleBar = this.querySelector('.console-bar');
        this.#consoleResizeState = this.#startVerticalResize(e, consoleBar, {
            direction: -1,
            minSize: 50,
        });
    }

    /**
     * Apply the chosen theme to the document and broadcast it to all components.
     * @param {string} theme - Theme name ('light' or 'dark')
     */
    #applyTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
        this[REACTOR].broadcast('theme', theme);
    }

    /**
     * Restore resize state and CodeMirror view after each render
     */
    afterRender() {
        if (this.selectedDemo) {
            if (this.#rightPaneResizeState) {
                const rightPane = this.querySelector('.right-pane');
                rightPane.style.flexBasis = `${this.#rightPaneResizeState.size}px`;
            }
            if (this.#consoleResizeState) {
                const consoleBar = this.querySelector('.console-bar');
                consoleBar.style.height = `${this.#consoleResizeState.size}px`;
            }
        }
        // Parent re-renders cascade to children but skip their afterRender(),
        // so morphing may clear the CodeMirror DOM. Restore it here.
        // The editor may still be a Child proxy (not yet mounted), so verify
        // the method exists before calling it.
        if (this.editorComponent && typeof this.editorComponent.restoreEditorView === 'function') {
            this.editorComponent.restoreEditorView();
        }
    }

    /**
     * Fetch HTML, CSS and JS source for every component in a demo.
     * @param {Demo} demo - Demo descriptor with name and optional components list
     * @returns {Promise.<Array.<{id: string, label: string, ext: string, content: string}>>} File descriptors
     */
    async #fetchDemoFiles(demo) {
        const templateStore = this[REACTOR]._templateStore;
        const basePath = this[REACTOR].basePath;
        const components = demo.components || [demo.name];
        const files = [];

        for (const componentName of components) {
            if (!templateStore.has(componentName)) {
                await templateStore.fetch(componentName, basePath);
            }
            const template = templateStore.get(componentName);
            const jsCode = await fetch(`${basePath}/${componentName}.js`).then((r) => r.text());
            const base = componentName.includes('/')
                ? componentName.split('/').pop()
                : componentName;

            for (const [ext, content] of [
                ['html', template.htmlCode],
                ['css', template.cssCode],
                ['js', jsCode],
            ]) {
                files.push({
                    id: `${componentName}/${ext}`,
                    label: `${base}.${ext}`,
                    ext,
                    content,
                });
            }
        }
        return files;
    }
}
