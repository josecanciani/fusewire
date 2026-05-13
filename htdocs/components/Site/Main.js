import { Component } from '../../js/component.js';
import { REACTOR } from '../../js/symbols.js';

/**
 * Root component for the FuseWire website.
 * Manages high-level navigation between Landing, Docs, and the Playground.
 * Acts as a pass-through layout for routing.
 */
export class Main extends Component {
    /**
     * page property.
     * @type {string}
     */
    page = 'home';

    /**
     * theme property.
     * @type {string}
     */
    theme = 'light';

    /**
     * landing property.
     * @type {import('./Landing.js').Landing|null}
     */
    landing = null;
    /**
     * docs property.
     * @type {import('./Docs.js').Docs|null}
     */
    docs = null;
    /**
     * demo property.
     * @type {import('../Playground/Home.js').Home|null}
     */
    demo = null;

    /**
     * Define the demo configuration previously held in index.html
     * @type {Array.<import('../Playground/Home.js').Demo>}
     */
    #demoConfig = [
        {
            name: 'Counter',
            title: 'Counter',
            description: 'Increment and decrement buttons.',
            tags: ['basics'],
            defaultFile: 'Counter/js',
        },
        {
            name: 'Lazy/LazyParent',
            title: 'Lazy Loading',
            description:
                'Demonstrates createLazyChild() with a custom placeholder and slow-loading component.',
            tags: ['basics'],
            defaultFile: 'Lazy/LazyParent/js',
            components: ['Lazy/LazyParent', 'Lazy/LazyLoading', 'Lazy/Lazy'],
        },
        {
            name: 'ErrorDemo/Parent',
            title: 'Error Boundaries',
            description:
                'Demonstrates fw-error bubbling and declarative fallbacks across different lifecycle hooks.',
            tags: ['basics'],
            defaultFile: 'ErrorDemo/Parent/js',
            components: ['ErrorDemo/Parent', 'ErrorDemo/FailComponent', 'ErrorDemo/Fallback'],
        },
        {
            name: 'GameOfLife/Game',
            title: 'Game of Life',
            description:
                "Conway's Game of Life. Click cells to toggle alive/dead, then play, step, or reset.",
            tags: ['performance'],
            defaultFile: 'GameOfLife/Game/js',
            components: [
                'GameOfLife/Game',
                'GameOfLife/Controls',
                'GameOfLife/Stats',
                'GameOfLife/Alive',
                'GameOfLife/Dead',
                'GameOfLife/Help',
            ],
        },
        {
            name: 'UrlDemo/UrlDemo',
            title: 'URL Routing',
            description:
                'Text and color driven by the browser URL. Edit the address bar and press Enter.',
            tags: ['basics'],
            defaultFile: 'UrlDemo/UrlDemo/js',
        },
    ];

    /**
     * get property.
     * @type {boolean}
     */
    get $isHome() {
        return this.page === 'home';
    }

    /**
     * get property.
     * @type {boolean}
     */
    get $isDocs() {
        return this.page === 'docs';
    }

    /**
     * get property.
     * @type {boolean}
     */
    get $isDemo() {
        return this.page === 'demo';
    }

    /**
     * get property.
     * @type {string}
     */
    get $homeActiveClass() {
        return this.page === 'home' ? 'active' : '';
    }

    /**
     * get property.
     * @type {string}
     */
    get $docsActiveClass() {
        return this.page === 'docs' ? 'active' : '';
    }

    /**
     * get property.
     * @type {string}
     */
    get $demoActiveClass() {
        return this.page === 'demo' ? 'active' : '';
    }

    /**
     * get property.
     * @type {boolean}
     */
    get $isLightTheme() {
        return this.theme === 'light';
    }

    /**
     * get property.
     * @type {boolean}
     */
    get $isDarkTheme() {
        return this.theme === 'dark';
    }

    /**
     * Initialize the site and load the requested page from the URL.
     * @param {Object<string, *>|null} previousState - State from previous destroy()
     * @param {import('../../js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     */
    async init(previousState, routeSegment) {
        const peek = this[REACTOR].router?.peekSegment();
        if (peek) {
            this.#setPageFromSegment(peek);
        } else if (routeSegment) {
            this.#setPageFromSegment(routeSegment);
        }
        await this.#loadPage();
    }

    /**
     * Handle back/forward navigation.
     * @param {import('../../js/component.js').ComponentVars} newVars - Vars to merge
     * @param {boolean} react - Whether to trigger a re-render
     * @param {import('../../js/route-segment.js').RouteSegment|null} routeSegment - Parsed URL segment
     * @returns {Promise<boolean>} True if updated
     */
    async update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            this.#setPageFromSegment(routeSegment);
            await this.#loadPage();
        } else {
            const peek = this[REACTOR].router?.peekSegment();
            if (peek) {
                this.#setPageFromSegment(peek);
                await this.#loadPage();
            }
        }
        return super.update(newVars, react, routeSegment);
    }

    /**
     * Pass-through layout: no segment of its own.
     * @returns {Object<string, string>} Empty route state
     */
    routeState() {
        return {};
    }

    /**
     * Navigate to a different page.
     * @param {string} page - Page name ('home', 'docs', 'demo')
     */
    async navigate(page) {
        if (this.page === page) return;
        this.page = page;
        await this.#loadPage();
        // Since we are pass-through, we just react() and the children
        // will contribute their segments to the new URL via pushRoute().
        this.react().then(() => this.pushRoute());
    }

    /**
     * Toggle between light and dark theme.
     */
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-bs-theme', this.theme);
        this.react();
    }

    /**
     * Determine which page to show based on the provided route segment key.
     * @param {import('../../js/route-segment.js').RouteSegment} segment - The peeked route segment
     */
    #setPageFromSegment(segment) {
        const key = segment.key;
        if (key === 'docs') this.page = 'docs';
        else if (key === 'demo') this.page = 'demo';
        else if (key === 'home') this.page = 'home';
        else this.page = 'home';
    }

    /**
     * Instantiate the child component for the current page.
     * The ID of the child must match the route key we expect in the URL.
     */
    async #loadPage() {
        if (this.page === 'home') {
            if (!this.landing) {
                this.landing = this.createChild('Site/Landing', 'home');
            }
        } else if (this.page === 'docs') {
            if (!this.docs) {
                this.docs = this.createChild('Site/Docs', 'docs');
            }
        } else if (this.page === 'demo') {
            if (!this.demo) {
                this.demo = this.createChild('Playground/Home', 'demo', {
                    demos: this.#demoConfig,
                });
            }
        }
    }
}
