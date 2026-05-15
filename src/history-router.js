import { RouteSegment, MinimalRouteEncoder } from './route-segment.js';
import { Component } from './component.js';
import { Child } from './component.js';
import { COMPONENT_ID, ROUTE_DEFAULTS } from './symbols.js';
import { HashUrlService } from './url-service.js';

/**
 * Configuration options for the HistoryRouter.
 * @typedef {{urlService?: import('./url-service.js').UrlService, routeEncoder?: import('./route-segment.js').RouteEncoder}} HistoryRouterConfig
 */

/**
 * History-based router for FuseWire.
 *
 * Injected into the Reactor at startup via config. Serializes/deserializes
 * component state to/from the browser URL. Each routed component declares
 * its contribution via routeState(), and the router walks the tree to build
 * flat DFS-ordered URL segments.
 *
 * URL reads, writes, and navigation event subscriptions are delegated to
 * a pluggable UrlService. The default HashUrlService stores routes in the
 * URL hash fragment (e.g. `#!/home:demo=Counter`) so no server-side
 * catch-all is needed. Pass HistoryUrlService for clean pathname-based
 * URLs (requires server config), or a fully custom UrlService.
 *
 * URL format: /routeKey:prop=val;prop=val/childKey:prop=val
 *
 * @example
 * // Default — hash-bang URLs, minimal encoding, no server config needed
 * const reactor = new Reactor('App');
 *
 * // Clean pathnames (requires server-side SPA catch-all)
 * import { HistoryUrlService } from './url-service.js';
 * const reactor = new Reactor('App', {
 *     router: new HistoryRouter({ urlService: new HistoryUrlService() }),
 * });
 *
 * // Custom encoder (e.g. full percent-encoding)
 * const reactor = new Reactor('App', {
 *     router: new HistoryRouter({ routeEncoder: myCustomEncoder }),
 * });
 */
export class HistoryRouter {
    /**
     * The Reactor instance this router is attached to.
     * @type {import('./reactor.js').Reactor}
     */
    #reactor;

    /**
     * The service responsible for reading, writing, and listening to URL changes.
     * @type {import('./url-service.js').UrlService}
     */
    #urlService;

    /**
     * The encoder responsible for serializing and deserializing segment values.
     * @type {import('./route-segment.js').RouteEncoder}
     */
    #routeEncoder;

    /**
     * Tokenized segments from the initial URL, consumed progressively
     * as the component tree builds during first load.
     * @type {Array.<RouteSegment>}
     */
    #initialSegments;

    /**
     * Cursor into #initialSegments — advances as components consume segments.
     * Set to -1 after the initial load is complete.
     * @type {number}
     */
    #initialCursor;

    /**
     * Create a new HistoryRouter.
     * @param {HistoryRouterConfig} config - Configuration options
     */
    constructor(config = {}) {
        this.#urlService = config.urlService || new HashUrlService();
        this.#routeEncoder = config.routeEncoder || new MinimalRouteEncoder();
    }

    /**
     * Attach to a reactor. Called by the Reactor during construction.
     * Tokenizes the current URL for progressive delivery during tree creation,
     * and sets up the navigation listener for back/forward navigation.
     * @param {import('./reactor.js').Reactor} reactor - The reactor instance
     */
    attach(reactor) {
        this.#reactor = reactor;
        this.#initialSegments = RouteSegment.tokenize(
            this.#urlService.getPath(),
            this.#routeEncoder,
        );
        this.#initialCursor = 0;
        this.#urlService.onNavigate(() => this.#onPopState());
    }

    /**
     * Serialize the full component tree and push a new browser history entry.
     * Called by Component.pushRoute() via this[REACTOR].router.
     */
    pushUrl() {
        this.#updateUrl(true);
    }

    /**
     * Serialize the full component tree and replace the current browser history entry.
     * Called by Component.replaceRoute() via this[REACTOR].router.
     */
    replaceUrl() {
        this.#updateUrl(false);
    }

    /**
     * Peek at the next available initial-load segment without consuming it.
     * Used by layout components to drive child selection during first load.
     * @returns {RouteSegment|null} Next segment or null
     */
    peekSegment() {
        if (this.#initialCursor < 0) return null;
        if (this.#initialCursor >= this.#initialSegments.length) return null;
        return this.#initialSegments[this.#initialCursor];
    }

    /**
     * Try to consume the next initial-load segment matching a route key.
     * Used during tree construction: the registry calls this for each child
     * being created, passing the child's route key (var name on the parent).
     * @param {string} routeKey - Expected route key (var name on parent)
     * @returns {RouteSegment|null} Matching segment or null
     */
    consumeSegment(routeKey) {
        if (this.#initialCursor < 0) return null;
        if (this.#initialCursor >= this.#initialSegments.length) return null;
        if (this.#initialSegments[this.#initialCursor].key === routeKey) {
            return this.#initialSegments[this.#initialCursor++];
        }
        return null;
    }

    /**
     * Mark the initial load as complete. After this, consumeSegment/consumeRootSegment
     * return null. Called by the Reactor after the root component is fully mounted.
     */
    completeInitialLoad() {
        this.#initialCursor = -1;
    }

    // ── popstate (back/forward) ──────────────────────────────────

    /**
     * Handle external navigation (browser back/forward, hash change, etc.).
     * Tokenizes the new URL, assigns segments to the existing tree
     * via the stack-based parser, then delivers each segment via update().
     */
    async #onPopState() {
        const segments = RouteSegment.tokenize(this.#urlService.getPath(), this.#routeEncoder);
        const assignments = this.#assignSegments(segments);
        await this.#walkAndApply(assignments);
    }

    /**
     * Assign tokenized URL segments to component codes using the stack-based
     * DFS parser. Requires the tree to be fully built.
     * Pass-through components (routeState returns {}) are transparent: the
     * parser expands their routed descendants as if they were direct children.
     * @param {Array.<RouteSegment>} segments - Tokenized URL segments
     * @returns {Map.<string, RouteSegment>} component code → matching segment
     */
    #assignSegments(segments) {
        const result = new Map();
        const registry = this.#reactor.instanceRegistry;
        let segIndex = 0;

        // Process root(s)
        for (const rootCode of registry._roots) {
            const rootEntry = registry._instances.get(rootCode);
            if (!rootEntry) continue;

            const state = rootEntry.instance.routeState();
            if (state === false) continue;

            if (segIndex < segments.length) {
                if (this.#hasRouteProperties(state)) {
                    // Routed: consume the segment
                    result.set(rootCode, segments[segIndex++]);
                } else {
                    // Pass-through: peek the segment so the layout can switch branches
                    result.set(rootCode, segments[segIndex]);
                }
            }

            // Stack: each frame tracks a component's remaining routed children.
            // The routeMap values are owner codes — the component whose var holds the child.
            const rootRouteMap = this.#getChildRouteMap(rootEntry);
            const stack = [{ code: rootCode, remaining: new Map(rootRouteMap) }];

            while (segIndex < segments.length && stack.length > 0) {
                const segment = segments[segIndex];
                let matched = false;

                while (stack.length > 0) {
                    const top = stack[stack.length - 1];
                    if (top.remaining.has(segment.key)) {
                        const ownerCode = top.remaining.get(segment.key);
                        top.remaining.delete(segment.key);
                        const ownerEntry = registry._instances.get(ownerCode);
                        const childCode = this.#resolveChildCode(ownerEntry, segment.key);
                        if (childCode) {
                            result.set(childCode, segment);
                            const childEntry = registry._instances.get(childCode);
                            if (childEntry) {
                                const childState = childEntry.instance.routeState();
                                if (this.#hasRouteProperties(childState)) {
                                    // Child consumed the segment
                                    segIndex++;
                                }
                                stack.push({
                                    code: childCode,
                                    remaining: new Map(this.#getChildRouteMap(childEntry)),
                                });
                            }
                            matched = true;
                        }
                        break;
                    }
                    stack.pop();
                }

                if (!matched) {
                    segIndex++; // Skip unmatched segment
                }
                if (stack.length === 0 && segIndex < segments.length) {
                    // Start over with next root if segments remain
                    break;
                }
            }
        }

        return result;
    }

    /**
     * Walk the live component tree top-down and deliver route segments
     * via the registry's update method. Awaits each level before descending
     * into children — update() may recreate children.
     * @param {Map.<string, RouteSegment>} assignments - code → segment map
     */
    async #walkAndApply(assignments) {
        const registry = this.#reactor.instanceRegistry;
        for (const rootCode of registry._roots) {
            await this.#applyToSubtree(rootCode, assignments, null);
        }
    }

    /**
     * Recursively apply route assignments to a component and its mounted children.
     * @param {string} code - Component code
     * @param {Map.<string, RouteSegment>} assignments - code → segment map
     * @param {RouteSegment|null} inheritedSegment - Segment passed down for pass-through components
     */
    async #applyToSubtree(code, assignments, inheritedSegment = null) {
        const registry = this.#reactor.instanceRegistry;
        const entry = registry._instances.get(code);
        if (!entry) return;

        const state = entry.instance.routeState();
        if (state === false) return;

        const segment = assignments.get(code) ?? null;
        const isPassThrough = !this.#hasRouteProperties(state);

        let effectiveSegment = segment;
        if (!effectiveSegment && isPassThrough) {
            effectiveSegment = inheritedSegment;
        }

        if (!isPassThrough || effectiveSegment) {
            // When a routed component has no matching URL segment, pass an
            // empty RouteSegment instead of null so the component can
            // distinguish "route update with no data" from "not a route update".
            const finalSegment = effectiveSegment ?? new RouteSegment('');
            await registry.update(entry.instance[COMPONENT_ID], {}, finalSegment);
        }

        const segmentToPass = effectiveSegment ?? inheritedSegment;

        // Walk mounted children (may have been recreated by update above)
        if (entry.children) {
            for (const [childCode] of entry.children) {
                await this.#applyToSubtree(childCode, assignments, segmentToPass);
            }
        }
    }

    // ── serialization (pushRoute / replaceRoute) ─────────────────

    /**
     * Serialize the full tree and update the URL via the URL service.
     * @param {boolean} push - true for pushState, false for replaceState
     */
    #updateUrl(push) {
        const url = this.#serialize();
        if (push) {
            this.#urlService.pushPath(url);
        } else {
            this.#urlService.replacePath(url);
        }
    }

    /**
     * Walk the component tree depth-first, calling routeState() on each
     * routed component, and build the full URL path.
     * Only visits mounted children — hidden children produce no segments.
     * @returns {string} Full URL path (e.g. "/dashboard:id=123/table:id=10")
     */
    #serialize() {
        /**
         * Accumulator for serialized string segments.
         * @type {string[]}
         */
        const parts = [];
        const registry = this.#reactor.instanceRegistry;
        for (const rootCode of registry._roots || []) {
            this.#serializeSubtree(rootCode, parts);
        }
        return '/' + parts.join('/');
    }

    /**
     * Recursively serialize a component and its mounted routed children.
     * @param {string} code - Component code
     * @param {Array.<string>} parts - Accumulator for URL path segments
     */
    #serializeSubtree(code, parts) {
        const registry = this.#reactor.instanceRegistry;
        const entry = registry._instances.get(code);
        if (!entry || !entry.container.isConnected) return;

        const state = entry.instance.routeState();
        if (state === false) return;

        if (this.#hasRouteProperties(state)) {
            // Filter out properties that still match their pre-init defaults
            const defaults = entry.instance[ROUTE_DEFAULTS];
            /**
             * State object containing only properties that have changed from their defaults.
             * @type {Record<string, any>}
             */
            const filtered = {};
            for (const [key, value] of Object.entries(state)) {
                if (!defaults || value !== defaults[key]) {
                    filtered[key] = value;
                }
            }
            const routeKey = this.#getRouteKeyForChild(
                /** @type {{instance: import('./component.js').Component, parent: import('./component.js').Component}} */ (
                    /** @type {unknown} */ (entry)
                ),
            );
            const segment = new RouteSegment(routeKey, new Map(Object.entries(filtered)));
            parts.push(segment.toString(this.#routeEncoder));
        }

        if (entry.children) {
            for (const [childCode] of entry.children) {
                this.#serializeSubtree(childCode, parts);
            }
        }
    }

    // ── route key resolution ─────────────────────────────────────

    /**
     * Get the route key for a component. The route key is the var name on
     * the parent component that holds this child. For root components,
     * falls back to the lowercase component name.
     * @param {{instance: Component, parent: Component|null}} entry - Registry entry for the component
     * @returns {string} Route key for URL serialization
     */
    #getRouteKeyForChild(entry) {
        if (!entry.parent) {
            // Root component — derive from component name
            const name = entry.instance[COMPONENT_ID].name;
            return name.split('/').pop().toLowerCase();
        }
        const parentEntry = this.#reactor.instanceRegistry._instances.get(entry.parent.code);
        if (!parentEntry) return entry.instance.componentCode;
        return (
            findVarName(parentEntry.instance, entry.instance.componentCode) ??
            entry.instance.componentCode
        );
    }

    /**
     * Build a map of route keys to owner codes for a component's routed
     * descendants. Pass-through components (routeState returns {}) are
     * transparent: their routed children are expanded as if they were
     * direct children of the ancestor.
     * @param {{instance: Component, children: Map<string, import('./component-id.js').ComponentId>|null}} entry - Registry entry for the parent
     * @returns {Map.<string, string>} routeKey → ownerCode (the component code whose var holds the child)
     */
    #getChildRouteMap(entry) {
        const map = new Map();
        this.#collectChildRouteKeys(entry, map);
        return map;
    }

    /**
     * Recursively collect route keys from an entry's children.
     * Pass-through children are expanded: their routed descendants appear
     * as if they were direct children of the calling parent.
     * @param {{instance: Component, children: Map<string, import('./component-id.js').ComponentId>|null}} entry - Registry entry to scan
     * @param {Map.<string, string>} map - Accumulator: routeKey → ownerCode (component code whose var holds the child)
     */
    #collectChildRouteKeys(entry, map) {
        if (!entry.children) return;

        const registry = this.#reactor.instanceRegistry;
        for (const [childCode] of entry.children) {
            const childEntry = registry._instances.get(childCode);
            if (!childEntry) continue;
            const state = childEntry.instance.routeState();
            if (state === false) continue;
            if (this.#hasRouteProperties(state)) {
                const varName = findVarName(entry.instance, childCode);
                if (varName) map.set(varName, entry.instance.componentCode);
            } else {
                // Pass-through — recurse into its children
                this.#collectChildRouteKeys(childEntry, map);
            }
        }
    }

    /**
     * Resolve a route key (var name) to a component code within a parent entry.
     * @param {{instance: Component}|undefined} parentEntry - Parent registry entry
     * @param {string} routeKey - Route key (var name) to resolve
     * @returns {string|null} Child component code or null
     */
    #resolveChildCode(parentEntry, routeKey) {
        if (!parentEntry) return null;
        const value = parentEntry.instance[routeKey];
        if (value instanceof Component || value instanceof Child) {
            return value.componentCode;
        }
        return null;
    }

    /**
     * Check whether a routeState return value has properties (non-empty object).
     * Pass-through components ({}) return true from routeState() but have no
     * properties — they don't consume URL segments.
     * @param {false|object} state - Return value from routeState()
     * @returns {boolean} True if state is a non-empty object
     */
    #hasRouteProperties(state) {
        return state !== false && Object.keys(state).length > 0;
    }
}

/**
 * Find the var name on a parent instance that holds a child with the given code.
 * Scans string-keyed properties for Component/Child instances.
 * @param {Component} parentInstance - Parent component instance
 * @param {string} childCode - Child component code to find
 * @returns {string|null} Var name or null if not found
 */
function findVarName(parentInstance, childCode) {
    for (const key of Object.keys(parentInstance)) {
        const value = parentInstance[key];
        if (
            (value instanceof Component || value instanceof Child) &&
            value.componentCode === childCode
        ) {
            return key;
        }
    }
    return null;
}
