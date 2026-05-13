import { Component, Child } from '/js/component.js';
import { REACTOR } from '/js/symbols.js';

/**
 * Playground Home component. Manages the sidebar, editor, and live demo preview.
 */
export class Home extends Component {
    /**
     * demos property.
     * @type {Array.<object>}
     */
    demos = [];
    /**
     * selectedDemo property.
     * @type {string|null}
     */
    selectedDemo = null;
    /**
     * demoRunId property.
     * @type {number}
     */
    demoRunId = 0;
    /**
     * filteredDemos property.
     * @type {Array.<object>}
     */
    filteredDemos = [];

    /**
     * demoComponent property.
     * @type {import('/js/component.js').ErrorBoundary}
     */
    demoComponent = null;
    /**
     * consoleComponent property.
     * @type {import('../Console/Panel.js').Panel}
     */
    consoleComponent = null;
    /**
     * sidebarComponent property.
     * @type {import('./Sidebar.js').Sidebar}
     */
    sidebarComponent = null;
    /**
     * editorComponent property.
     * @type {import('./Editor.js').Editor}
     */
    editorComponent = null;
    /**
     * tagFilterComponent property.
     * @type {import('./TagFilter.js').TagFilter}
     */
    tagFilterComponent = null;

    /**
     * Resize horizontal start function.
     * @type {function(MouseEvent, HTMLElement, object): {cancel(): void, size: number} | null}
     */
    #startHorizontalResize = null;
    /**
     * Resize vertical start function.
     * @type {function(MouseEvent, HTMLElement, object): {cancel(): void, size: number} | null}
     */
    #startVerticalResize = null;
    /**
     * sidebarHidden property.
     * @type {boolean}
     */
    sidebarHidden = false;
    /**
     * sidebarDisplayClass property.
     * @type {string}
     */
    sidebarDisplayClass = '';

    /**
     * Whether the current tag filter has returned no results.
     * @returns {boolean} True if no demos match the current filter
     */
    get $noResults() {
        return this.filteredDemos.length === 0;
    }

    /**
     * Initialize playground with available demos and restore state from persistence.
     * @param {Object<string, *>|null} previousState - Restored state
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - URL segment
     */
    async init(previousState, routeSegment) {
        this.filteredDemos = this.demos;
        this.loadLibrary('Lib/Resize');

        const allTags = [...new Set(this.demos.flatMap((d) => d.tags))];
        if (this.tagFilterComponent === null) {
            this.tagFilterComponent = this.createChild('Playground/TagFilter', 'tags', {
                tags: allTags.map((name) => ({ name, activeClass: '' })),
            });
        }
        this.tagFilterComponent.on('change', (tags) => this.filterByTag(tags));

        // Unconditionally declare children that persist across demo changes.
        // If they were restored from persistence, createChild() safely overwrites
        // the plain JSON marker with a functional Child reference, and the buffered
        // .on() events will correctly attach to the live instances.
        if (this.sidebarComponent === null) {
            this.sidebarComponent = this.createChild('Playground/Sidebar', 'sidebar', {
                demos: this.demos,
                demoFiles: [],
            });
        }
        this.sidebarComponent.on('selectDemo', (name) => this.selectDemo(name));
        this.sidebarComponent.on('openFile', (id) => this.editorComponent.openFile(id));
        this.sidebarComponent.on('back', () => this.back());

        if (this.editorComponent === null) {
            this.editorComponent = this.createChild('Playground/Editor', 'editor', {
                files: [],
                activeFileId: null,
            });
        }
        this.editorComponent.on('runDemo', () => this.runDemo());
        this.editorComponent.on('activeFileChanged', (id) =>
            this.sidebarComponent.highlightFile(id),
        );

        if (this.consoleComponent === null) {
            this.consoleComponent = this.createChild('Console/Panel', 'console', { logs: [] });
        }

        if (routeSegment) {
            const val = routeSegment.getString('demo');
            const demo = this.demos.find((d) => d.name === val || d.title === val);
            if (demo) {
                await this.#loadDemo(demo.name);
            }
        }
    }

    /**
     * Scroll the console to the bottom after rendering.
     */
    afterRender() {
        const container = this.querySelector('.console-panel-logs');
        if (container) {
            const scrollParent = container.closest('.overflow-auto');
            if (scrollParent) {
                scrollParent.scrollTop = scrollParent.scrollHeight;
            }
        }
    }

    /**
     * Load the horizontal resize library and initialize the handler.
     */
    hydrate() {
        const resizeLib = this.library('Lib/Resize');
        this.#startHorizontalResize = resizeLib.startHorizontalResize;
        this.#startVerticalResize = resizeLib.startVerticalResize;
    }

    /**
     * Declare the selected demo as the Home component's URL contribution.
     * @returns {Object<string, string>} Route state with the current demo name
     */
    routeState() {
        const demo = this.demos.find((d) => d.name === this.selectedDemo);
        return { demo: demo ? demo.name : '' };
    }

    /**
     * Handle URL changes (browser back/forward) by reading the demo name/title
     * from the route segment and navigating accordingly.
     * @param {import('/js/component.js').ComponentVars} newVars - Vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('/js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment during popstate
     * @returns {Promise<void>} Resolves when the state change is complete
     */
    async update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            const val = routeSegment.getString('demo');
            const demo = this.demos.find((d) => d.name === val || d.title === val);
            const name = demo ? demo.name : '';
            if (name && name !== this.selectedDemo) {
                await this.#loadDemo(name);
                if (react) this.react();
            }
        }
        return super.update(newVars, react);
    }

    /**
     * Filter the demo list by tag and re-render the sidebar.
     * @param {string[]} selectedTags - List of active tag names
     */
    filterByTag(selectedTags) {
        if (selectedTags.length === 0) {
            this.filteredDemos = this.demos;
        } else {
            this.filteredDemos = this.demos.filter((d) =>
                selectedTags.every((tag) => d.tags.includes(tag)),
            );
        }
        this.sidebarComponent.update({ demos: this.filteredDemos });
        this.react();
    }

    /**
     * Select a demo and load its files into the editor.
     * @param {string} name - Demo component name
     */
    async selectDemo(name) {
        this.selectedDemo = name;
        await this.#loadDemo(name);
        this.pushRoute();
        this.react();
    }

    /**
     * Clear the current demo and return to the main landing page.
     */
    back() {
        this.selectedDemo = null;
        this.pushRoute();
        this.react();
    }

    /**
     * Run the current demo by re-creating the demo component with the
     * latest editor content.
     */
    async runDemo() {
        const demo = this.demos.find((d) => d.name === this.selectedDemo);
        if (!demo) return;

        // Re-read current file contents from Editor before running
        const contents = this.editorComponent.getContents();

        try {
            // Update the template store with local modifications
            for (const file of this.editorComponent.files) {
                const content = contents.get(file.id);
                if (content === undefined) continue;

                // file.id is formatted as "ComponentName/ext" (e.g. "ErrorDemo/Parent/html")
                const compName = file.id.substring(0, file.id.lastIndexOf('/'));

                if (file.ext === '.html') {
                    this[REACTOR]._templateStore.set(compName, { htmlCode: content });
                } else if (file.ext === '.css') {
                    this[REACTOR]._templateStore.set(compName, { cssCode: content });
                }
            }

            const registry = this[REACTOR].instanceRegistry;
            if (this.demoComponent) {
                registry.remove(this.demoComponent.toComponentId());
            }

            // We increment runId so the top-level parent gets a unique instance id.
            this.demoRunId = Date.now();
            this.demoComponent = this.createErrorBoundedChild(
                this.createChild(demo.name, `demo-${this.demoRunId}`, demo.vars || {}),
                'Playground/DemoFallback',
            );
            this.react();
        } catch (err) {
            this.console.error(`Run failed: ${/** @type {Error} */ (err).message}`);
        }
    }

    /**
     * Toggle the sidebar visibility.
     */
    toggleSidebar() {
        this.sidebarHidden = !this.sidebarHidden;
        this.sidebarDisplayClass = this.sidebarHidden ? 'hidden' : '';
        this.react();
    }

    /**
     * Handle the horizontal resize start.
     * @param {MouseEvent} event - Mouse event
     */
    startResize(event) {
        if (!this.#startHorizontalResize) return;

        this.#startHorizontalResize(
            event,
            /** @type {HTMLElement} */ (this.querySelector('.right-pane')),
            {
                /**
                 * Handle horizontal resize.
                 * @param {number} size - The new size
                 */
                onResize: (size) => {
                    this.console.log(`Right pane resized to ${size}px`);
                },
            },
        );
    }

    /**
     * Handle the vertical resize start.
     * @param {MouseEvent} event - Mouse event
     */
    startConsoleResize(event) {
        if (!this.#startVerticalResize) return;

        this.#startVerticalResize(
            event,
            /** @type {HTMLElement} */ (this.querySelector('.console-bar')),
            {
                /**
                 * Handle vertical resize.
                 * @param {number} size - The new size
                 */
                onResize: (size) => {
                    this.console.log(`Console resized to ${size}px`);
                },
            },
        );
    }

    /**
     * Private helper to load a demo's files and update child components.
     * @param {string} name - Demo name
     * @returns {Promise<boolean|void>} Resolves when loaded
     */
    async #loadDemo(name) {
        console.log('loadDemo start', name);
        this.selectedDemo = name;
        const demo = this.demos.find((d) => d.name === name);
        if (!demo) {
            console.log('loadDemo end (no demo)', name);
            return;
        }

        const componentNames = demo.components || [demo.name];
        const files = [];

        const loadedComponents = await Promise.all(
            componentNames.map(async (compName) => {
                const baseUrl = this[REACTOR].basePath + '/' + compName;
                const [html, js, css] = await Promise.all([
                    fetch(baseUrl + '.html').then((r) => (r.ok ? r.text() : '')),
                    fetch(baseUrl + '.js').then((r) => (r.ok ? r.text() : '')),
                    fetch(baseUrl + '.css')
                        .then((r) => (r.ok ? r.text() : ''))
                        .catch(() => ''),
                ]);
                return { compName, html, js, css };
            }),
        );

        for (const { compName, html, js, css } of loadedComponents) {
            files.push({
                id: compName + '/html',
                label: compName + '.html',
                ext: '.html',
                content: html,
            });
            files.push({ id: compName + '/js', label: compName + '.js', ext: '.js', content: js });
            if (css) {
                files.push({
                    id: compName + '/css',
                    label: compName + '.css',
                    ext: '.css',
                    content: css,
                });
            }
        }

        const demoFiles = files.map((f) => ({ id: f.id, label: f.label }));
        const defaultFileId = demo.defaultFile || demo.name + '/js';

        // Check if we are hydrating from an initial URL load
        let isHydratingFromUrl = false;
        const nextSegment = this[REACTOR].router?.peekSegment();
        if (nextSegment && nextSegment.key.startsWith('demo-')) {
            const parsed = parseInt(nextSegment.key.substring(5), 10);
            if (!Number.isNaN(parsed)) {
                this.demoRunId = parsed;
                isHydratingFromUrl = true;
            }
        }

        // Generate a new ID if we are switching demos or clicking Run
        if (!isHydratingFromUrl) {
            this.demoRunId = Date.now();
        }

        this.demoComponent = this.createErrorBoundedChild(
            this.createChild(demo.name, `demo-${this.demoRunId}`, demo.vars || {}),
            'Playground/DemoFallback',
        );

        if (this.sidebarComponent instanceof Child) {
            // If they are still Child references, wait for their eager creation to finish
            // before calling their instance-specific methods.
            this.sidebarComponent.whenReady().then(
                /**
                 * Wait for sidebar to resolve.
                 * @param {import('./Sidebar.js').Sidebar|null} sidebar - Sidebar instance
                 */
                (sidebar) => {
                    if (sidebar) sidebar.update({ demos: this.demos, demoFiles });
                },
            );
        } else if (this.sidebarComponent) {
            this.sidebarComponent.update({ demos: this.demos, demoFiles });
        }

        if (this.editorComponent instanceof Child) {
            this.editorComponent.whenReady().then((editor) => {
                if (editor) editor.update({ files, activeFileId: defaultFileId });
            });
        } else if (this.editorComponent) {
            this.editorComponent.update({ files, activeFileId: defaultFileId });
        }

        console.log('loadDemo end', name);
        return true;
    }
}
