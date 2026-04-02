import { Component } from '/js/component.js';
import { ComponentId } from '/js/component-id.js';
import { REACTOR } from '/js/symbols.js';

export class Home extends Component {
    /** @type {Array.<object>} */
    demos = [];
    /** @type {Array.<object>} */
    filteredDemos = [];
    /** @type {boolean} */
    noResults = false;
    /** @type {string|null} */
    selectedDemo = null;
    /** @type {Component|import('/js/component.js').Child|null} */
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

    #resizeState = null;
    #startHorizontalResize = null;

    /**
     * Initialize the playground with a header, tag filter and console panel
     */
    async init() {
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

        this.consoleComponent = /** @type {import('../Console/Panel.js').Panel} */ (
            this.createChild('Console/Panel', 'console', { logs: [] })
        );
    }

    hydrate() {
        const startHorizontalResize =
            /** @type {typeof import('../Lib/Resize.js').startHorizontalResize} */ (
                this.library('Lib/Resize').startHorizontalResize
            );
        this.#startHorizontalResize = startHorizontalResize;
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
     * Select and load a demo by name.
     * @param {string} name - Demo name
     */
    async selectDemo(name) {
        const demo = this.demos.find((d) => d.name === name);
        if (!demo) return;
        if (this.selectedDemo === name) return;

        const files = await this.#fetchDemoFiles(demo);
        const demoFiles = files.map((f, i) => ({
            id: f.id,
            label: f.label,
            activeClass: i === 0 ? 'active' : '',
        }));

        this.demos.forEach((d) => {
            d.activeClass = d.name === name ? 'active' : '';
        });
        this.selectedDemo = name;
        this.demoComponent = this.createChild(demo.name, 'demo', demo.vars || {});

        if (this.sidebarComponent) {
            this.sidebarComponent.update({ demos: this.demos, demoFiles });
            this.editorComponent.loadFiles(files);
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
                })
            );
            this.editorComponent.on('runDemo', () => {
                this.runDemo();
            });
            this.editorComponent.on('activeFileChanged', (id) =>
                this.sidebarComponent.highlightFile(id),
            );
        }

        this.react();
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
                // so rewrite them to full URLs using the current origin.
                const resolvedJs = jsCode.replace(/(from\s+['"])\//g, `$1${location.origin}/`);
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

            // Remove and recreate only the root demo instance — children are auto-managed
            const demoId = new ComponentId(demo.name, 'demo');
            if (registry.has(demoId)) {
                await registry.remove(demoId);
            }

            this.demoComponent = this.createChild(demo.name, 'demo', {});
            this.react();
        } catch (err) {
            this.console.error(`Run failed: ${err.message}`);
        }
    }

    /**
     * Navigate back to the demo list.
     */
    back() {
        if (this.#resizeState) this.#resizeState.cancel();
        this.#resizeState = null;
        this.selectedDemo = null;
        this.demoComponent = null;
        this.sidebarComponent = null;
        this.editorComponent = null;
        this.demos.forEach((d) => {
            d.activeClass = '';
        });
        this.react();
    }

    /**
     * Start a horizontal resize drag on the right pane.
     * @param {MouseEvent} e - The mousedown event
     */
    startResize(e) {
        const rightPane = this.querySelector('.right-pane');
        this.#resizeState = this.#startHorizontalResize(e, rightPane);
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
        if (this.selectedDemo && this.#resizeState) {
            const rightPane = this.querySelector('.right-pane');
            rightPane.style.flexBasis = `${this.#resizeState.width}px`;
        }
        // Parent re-renders cascade to children but skip their afterRender(),
        // so morphing may clear the CodeMirror DOM. Restore it here.
        if (this.editorComponent) {
            this.editorComponent.restoreEditorView();
        }
    }

    /**
     * Fetch HTML, CSS and JS source for every component in a demo.
     * @param {object} demo - Demo descriptor with name and optional components list
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
