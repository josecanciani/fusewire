/**
 * Abstract URL service interface for the HistoryRouter.
 *
 * The router delegates all URL reads, writes, and navigation event
 * subscriptions through this interface. The default implementation
 * (HashUrlService) uses hash-bang URLs (#!) so no server-side routing
 * is needed. Developers can inject HistoryUrlService for clean
 * pathname-based URLs (requires a server catch-all), or provide a
 * fully custom implementation for multi-reactor pages, iframes, etc.
 *
 * @example
 * // Default — hash-bang URLs (#!), no server config needed
 * const router = new HistoryRouter();
 *
 * // Clean pathnames — requires server-side SPA catch-all
 * const router = new HistoryRouter({ urlService: new HistoryUrlService() });
 *
 * // Custom — e.g. scope one reactor to a query parameter
 * const router = new HistoryRouter({ urlService: myCustomService });
 */
export class UrlService {
    /**
     * Read the current URL path.
     * @returns {string} The path portion of the current URL (e.g. "/dashboard:id=123")
     */
    getPath() {
        throw new Error('UrlService.getPath() must be implemented by a subclass');
    }

    /**
     * Push a new entry onto the browser (or equivalent) history stack.
     * @param {string} path - The new URL path to navigate to
     */
    pushPath(path) {
        void path;
        throw new Error('UrlService.pushPath() must be implemented by a subclass');
    }

    /**
     * Replace the current entry in the history stack without adding a new one.
     * @param {string} path - The URL path to replace with
     */
    replacePath(path) {
        void path;
        throw new Error('UrlService.replacePath() must be implemented by a subclass');
    }

    /**
     * Subscribe to external navigation events (e.g. browser back/forward).
     * The router calls this once during attach(). The handler should be
     * invoked whenever the URL changes from an external source (popstate,
     * hash change, etc.) — but NOT in response to pushPath/replacePath
     * calls made by the router itself.
     * @param {function(): void} handler - Callback to invoke on navigation
     * @returns {function(): void} Unsubscribe function
     */
    onNavigate(handler) {
        void handler;
        throw new Error('UrlService.onNavigate() must be implemented by a subclass');
    }
}

/**
 * Default URL service using hash-bang (#!) URLs.
 *
 * Routes are stored in the URL fragment (e.g. `#!/dashboard:id=123`),
 * so the server always sees the base URL — no catch-all route needed.
 * Uses history.pushState/replaceState for writes (no events fire),
 * and the hashchange event for external navigation detection
 * (browser back/forward and manual URL edits).
 *
 * @example
 * // Used automatically when no urlService is provided to HistoryRouter:
 * const router = new HistoryRouter();
 * // equivalent to:
 * const router = new HistoryRouter({ urlService: new HashUrlService() });
 */
export class HashUrlService extends UrlService {
    /**
     * Read the current route path from the URL hash fragment.
     * Strips the `#!` prefix; returns '' if no hash or wrong format.
     * @returns {string} The route path (e.g. "/dashboard:id=123/table:id=10")
     */
    getPath() {
        const hash = globalThis.location?.hash ?? '';
        return hash.startsWith('#!') ? hash.substring(2) : '';
    }

    /**
     * Push a new history entry with a hash-bang URL via history.pushState.
     * Using pushState (instead of setting location.hash) avoids firing
     * hashchange, so the router's own writes don't trigger onNavigate.
     * @param {string} path - The new route path
     */
    pushPath(path) {
        globalThis.history?.pushState(null, '', '#!' + path);
    }

    /**
     * Replace the current history entry with a hash-bang URL.
     * @param {string} path - The replacement route path
     */
    replacePath(path) {
        globalThis.history?.replaceState(null, '', '#!' + path);
    }

    /**
     * Listen for hashchange events (browser back/forward, manual URL edits).
     * Since writes use pushState/replaceState, hashchange only fires for
     * external navigation — matching the UrlService contract.
     * @param {function(): void} handler - Callback invoked on hashchange
     * @returns {function(): void} Unsubscribe function that removes the listener
     */
    onNavigate(handler) {
        globalThis.addEventListener?.('hashchange', handler);
        return () => globalThis.removeEventListener?.('hashchange', handler);
    }
}

/**
 * URL service backed by the browser History API with clean pathnames.
 *
 * Uses window.location.pathname for reads, history.pushState/replaceState
 * for writes, and the popstate event for external navigation detection.
 * Requires a server-side catch-all that serves the SPA's index.html
 * for all routes.
 *
 * @example
 * const router = new HistoryRouter({ urlService: new HistoryUrlService() });
 */
export class HistoryUrlService extends UrlService {
    /**
     * Read the current URL path from window.location.
     * @returns {string} The pathname (e.g. "/dashboard:id=123/table:id=10")
     */
    getPath() {
        return globalThis.location?.pathname ?? '';
    }

    /**
     * Push a new history entry via history.pushState.
     * @param {string} path - The new URL path
     */
    pushPath(path) {
        globalThis.history?.pushState(null, '', path);
    }

    /**
     * Replace the current history entry via history.replaceState.
     * @param {string} path - The replacement URL path
     */
    replacePath(path) {
        globalThis.history?.replaceState(null, '', path);
    }

    /**
     * Listen for popstate events (browser back/forward navigation).
     * @param {function(): void} handler - Callback invoked on popstate
     * @returns {function(): void} Unsubscribe function that removes the listener
     */
    onNavigate(handler) {
        globalThis.addEventListener?.('popstate', handler);
        return () => globalThis.removeEventListener?.('popstate', handler);
    }
}
