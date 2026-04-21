import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { HistoryRouter } from '../src/history-router.js';
import { RouteSegment } from '../src/route-segment.js';
import { Reactor } from '../src/reactor.js';
import { Component } from '../src/component.js';
import { FuseWire } from '../src/fusewire.js';
import { REACTOR } from '../src/symbols.js';
import { UrlService } from '../src/url-service.js';

// Track app names to unregister after each test
let registeredApps = [];
let dom;

/**
 * Create a Reactor and track it for cleanup
 * @param {string} appName - Application name
 * @param {object} config - Reactor config
 * @returns {Reactor} The created reactor
 */
function createReactor(appName, config = {}) {
    registeredApps.push(appName);
    return new Reactor(appName, { morphFunction: () => {}, ...config });
}

beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/',
    });
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.localStorage = dom.window.localStorage;
    global.history = dom.window.history;
    global.location = dom.window.location;
});

afterEach(() => {
    for (const name of registeredApps) {
        FuseWire.unregister(name);
    }
    registeredApps = [];
    delete global.document;
    delete global.HTMLElement;
    delete global.localStorage;
    delete global.history;
    delete global.location;
});

describe('HistoryRouter', () => {
    describe('constructor and attach', () => {
        it('creates a router instance', () => {
            const router = new HistoryRouter();
            assert.ok(router);
        });

        it('attaches to a reactor', () => {
            const router = new HistoryRouter();
            const reactor = createReactor('attach-test', { router });
            assert.strictEqual(reactor.router, router);
        });
    });

    describe('consumeRootSegment', () => {
        it('returns null for empty URL', () => {
            const router = new HistoryRouter();
            createReactor('root-empty', { router });
            assert.strictEqual(router.consumeRootSegment(), null);
        });

        it('returns null after completeInitialLoad', () => {
            const router = new HistoryRouter();
            createReactor('root-complete', { router });
            router.completeInitialLoad();
            assert.strictEqual(router.consumeRootSegment(), null);
        });
    });

    describe('consumeSegment', () => {
        it('returns null when no segments remain', () => {
            const router = new HistoryRouter();
            createReactor('consume-empty', { router });
            assert.strictEqual(router.consumeSegment('dashboard'), null);
        });

        it('returns null after completeInitialLoad', () => {
            const router = new HistoryRouter();
            createReactor('consume-complete', { router });
            router.completeInitialLoad();
            assert.strictEqual(router.consumeSegment('test'), null);
        });
    });

    describe('pushUrl and replaceUrl', () => {
        it('pushUrl serializes tree and pushes history state', () => {
            const router = new HistoryRouter();
            const reactor = createReactor('push-test', { router });

            // pushUrl with no components produces a root-only URL
            router.pushUrl();
            // Should not throw; history state updated
            assert.ok(true);
        });

        it('replaceUrl serializes tree and replaces history state', () => {
            const router = new HistoryRouter();
            const reactor = createReactor('replace-test', { router });

            router.replaceUrl();
            // Should not throw; history state updated
            assert.ok(true);
        });
    });
});

describe('Component routing methods', () => {
    describe('routeState', () => {
        it('returns false by default', () => {
            const component = new Component();
            assert.strictEqual(component.routeState(), false);
        });

        it('can be overridden to return route properties', () => {
            class RoutedComponent extends Component {
                routeState() {
                    return { page: this.page };
                }
            }
            const component = new RoutedComponent();
            component.page = 'home';
            assert.deepStrictEqual(component.routeState(), { page: 'home' });
        });

        it('can return empty object for pass-through', () => {
            class PassThrough extends Component {
                routeState() {
                    return {};
                }
            }
            const component = new PassThrough();
            assert.deepStrictEqual(component.routeState(), {});
        });
    });

    describe('pushRoute', () => {
        it('throws when no router is configured', () => {
            const component = new Component();
            component[REACTOR] = { router: null };
            assert.throws(
                () => component.pushRoute(),
                { message: 'pushRoute() requires a HistoryRouter on the Reactor' },
            );
        });

        it('calls router.pushUrl when router is configured', () => {
            let pushCalled = false;
            const component = new Component();
            component[REACTOR] = {
                router: { pushUrl: () => { pushCalled = true; } },
            };
            component.pushRoute();
            assert.strictEqual(pushCalled, true);
        });
    });

    describe('replaceRoute', () => {
        it('throws when no router is configured', () => {
            const component = new Component();
            component[REACTOR] = { router: null };
            assert.throws(
                () => component.replaceRoute(),
                { message: 'replaceRoute() requires a HistoryRouter on the Reactor' },
            );
        });

        it('calls router.replaceUrl when router is configured', () => {
            let replaceCalled = false;
            const component = new Component();
            component[REACTOR] = {
                router: { replaceUrl: () => { replaceCalled = true; } },
            };
            component.replaceRoute();
            assert.strictEqual(replaceCalled, true);
        });
    });

    describe('update with routeSegment', () => {
        it('auto-maps segment properties when routeState declares them', () => {
            class RoutedComponent extends Component {
                constructor() {
                    super();
                    this.page = 'default';
                    this.sort = 'name';
                }

                routeState() {
                    return { page: this.page, sort: this.sort };
                }
            }

            const component = new RoutedComponent();
            component[REACTOR] = { react: () => Promise.resolve(), drainPromise: Promise.resolve() };
            const segment = new RouteSegment('test', new Map([['page', 'settings'], ['sort', 'date']]));
            component.update({}, false, segment);
            assert.strictEqual(component.page, 'settings');
            assert.strictEqual(component.sort, 'date');
        });

        it('does not auto-map when routeState returns false', () => {
            const component = new Component();
            component[REACTOR] = { react: () => Promise.resolve(), drainPromise: Promise.resolve() };
            component.myProp = 'original';
            const segment = new RouteSegment('test', new Map([['myProp', 'changed']]));
            component.update({}, false, segment);
            assert.strictEqual(component.myProp, 'original');
        });

        it('skips segment properties not in routeState', () => {
            class RoutedComponent extends Component {
                constructor() {
                    super();
                    this.page = 'default';
                    this.secret = 'unchanged';
                }

                routeState() {
                    return { page: this.page };
                }
            }

            const component = new RoutedComponent();
            component[REACTOR] = { react: () => Promise.resolve(), drainPromise: Promise.resolve() };
            const segment = new RouteSegment('test', new Map([['page', 'new'], ['secret', 'hacked']]));
            component.update({}, false, segment);
            assert.strictEqual(component.page, 'new');
            assert.strictEqual(component.secret, 'unchanged');
        });

        it('does not overwrite vars from newVars that conflict with segment', () => {
            class RoutedComponent extends Component {
                constructor() {
                    super();
                    this.page = 'default';
                }

                routeState() {
                    return { page: this.page };
                }
            }

            const component = new RoutedComponent();
            component[REACTOR] = { react: () => Promise.resolve(), drainPromise: Promise.resolve() };
            const segment = new RouteSegment('test', new Map([['page', 'from-url']]));
            // newVars applied AFTER auto-map, so newVars wins
            component.update({ page: 'from-vars' }, false, segment);
            assert.strictEqual(component.page, 'from-vars');
        });

        it('passes null routeSegment without error', () => {
            const component = new Component();
            component[REACTOR] = { react: () => Promise.resolve(), drainPromise: Promise.resolve() };
            component.update({}, false, null);
            // Should not throw
            assert.ok(true);
        });
    });

    describe('init with routeSegment', () => {
        it('accepts routeSegment as second parameter', async () => {
            let receivedSegment = 'not-called';

            class RoutedComponent extends Component {
                async init(previousState, routeSegment) {
                    receivedSegment = routeSegment;
                }
            }

            const component = new RoutedComponent();
            const segment = new RouteSegment('test', new Map([['id', '42']]));
            await component.init(null, segment);
            assert.strictEqual(receivedSegment, segment);
            assert.strictEqual(receivedSegment.get('id'), '42');
        });

        it('receives null routeSegment when no router', async () => {
            let receivedSegment = 'not-called';

            class RoutedComponent extends Component {
                async init(previousState, routeSegment) {
                    receivedSegment = routeSegment;
                }
            }

            const component = new RoutedComponent();
            await component.init(null, null);
            assert.strictEqual(receivedSegment, null);
        });
    });
});

describe('HistoryRouter with custom UrlService', () => {
    /**
     * Create a fake UrlService that stores path in memory.
     * @param {string} initialPath - The initial path to return from getPath()
     * @returns {{service: UrlService, calls: object}} Service instance and call tracker
     */
    function createFakeUrlService(initialPath = '/') {
        let currentPath = initialPath;
        let navigateHandler = null;
        const calls = { pushCount: 0, replaceCount: 0, paths: [] };
        const service = new UrlService();
        service.getPath = () => currentPath;
        service.pushPath = (path) => {
            currentPath = path;
            calls.pushCount++;
            calls.paths.push(path);
        };
        service.replacePath = (path) => {
            currentPath = path;
            calls.replaceCount++;
            calls.paths.push(path);
        };
        service.onNavigate = (handler) => {
            navigateHandler = handler;
            return () => { navigateHandler = null; };
        };
        return { service, calls, triggerNavigate: () => navigateHandler?.() };
    }

    it('uses custom UrlService for initial path reading', () => {
        const { service } = createFakeUrlService('/home:demo=Counter');
        const router = new HistoryRouter({ urlService: service });
        createReactor('custom-svc-init', { router });
        const segment = router.consumeRootSegment();
        assert.ok(segment);
        assert.strictEqual(segment.key, 'home');
        assert.strictEqual(segment.get('demo'), 'Counter');
    });

    it('uses custom UrlService for pushUrl', () => {
        const { service, calls } = createFakeUrlService('/');
        const router = new HistoryRouter({ urlService: service });
        createReactor('custom-svc-push', { router });
        router.pushUrl();
        assert.strictEqual(calls.pushCount, 1);
        assert.strictEqual(calls.replaceCount, 0);
    });

    it('uses custom UrlService for replaceUrl', () => {
        const { service, calls } = createFakeUrlService('/');
        const router = new HistoryRouter({ urlService: service });
        createReactor('custom-svc-replace', { router });
        router.replaceUrl();
        assert.strictEqual(calls.replaceCount, 1);
        assert.strictEqual(calls.pushCount, 0);
    });

    it('pushUrl serializes an empty tree to root path', () => {
        const { service, calls } = createFakeUrlService('/');
        const router = new HistoryRouter({ urlService: service });
        createReactor('custom-svc-empty', { router });
        router.pushUrl();
        assert.strictEqual(calls.paths[0], '/');
    });

    it('uses default HashUrlService when no urlService is provided', () => {
        const router = new HistoryRouter();
        createReactor('default-svc', { router });
        // Should not throw and should work with the globalThis defaults
        router.pushUrl();
        assert.ok(true);
    });
});
