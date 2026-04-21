# Blueprint: History Router

## Implementation Status

| Feature | Status |
|---|---|
| URL format specification | Implemented |
| Routing API (`routeState`, `pushRoute`, `replaceRoute`) | Implemented (`src/component.js`) |
| Route Segment typed accessor | Implemented (`src/route-segment.js`) |
| Lifecycle integration (`init`, `update` with `routeSegment`) | Implemented (`src/instance.js`) |
| Auto-discovery of routed children (mounted only) | Implemented (`src/history-router.js`) |
| Auto-mapping in `update()` | Implemented (`src/component.js`) |
| Stack-based URL parser with pass-through support | Implemented (`src/history-router.js`) |
| `HistoryRouter` module | Implemented (`src/history-router.js`) |
| Pluggable URL service (`UrlService`, `HashUrlService`, `HistoryUrlService`) | Implemented (`src/url-service.js`) |
| ErrorBoundary routing pass-through | Implemented (`src/component.js`) |
| Unit tests | Implemented (`test/route-segment.test.js`, `test/history-router.test.js`, `test/url-service.test.js`) |
| Playground URL integration | Implemented (`htdocs/components/Playground/Home.js`, `htdocs/index.html`) |
| UrlDemo component | Implemented (`htdocs/components/UrlDemo/UrlDemo.js`) |
| Playwright integration tests | Planned |
| Internationalized routes | Future (see [translations.md](translations.md)) |
| SSR compatibility | Future |

## Overview & Motivation

When the framework updates the DOM via `InstanceRegistry` morphing, the browser URL remains static. For components like Pagination (`?page=3`), tabs (`#details`), or item views (`/item/44`), a disparity is created between the application state and the browser's history log.

Instead of building a heavy, nested Route Provider that intercepts and builds components from scratch (like React Router), the FuseWire Router maps URL segments to individual components. Each component decides what it contributes to the URL via a single method (`routeState()`). The framework discovers routed children automatically by scanning mounted children in the registry, walks the tree to build and parse URLs, and delivers route state through the existing lifecycle hooks (`init`, `update`). No manual event wiring, no forwarding boilerplate.

## URL Format

### Segment Structure

Each routed component occupies a single path segment. The segment format is:

```
routeKey:property=value;property=value
```

- **Route key** — identifies the component within its parent. Appears before the first `:`. Defaults to the var name on the parent component; can be overridden via translation files (see [translations.md](translations.md)).
- **Properties** — key-value pairs separated by `;`. The first property is separated from the route key by `:`, subsequent properties by `;`.
- Both `:` and `;` are valid in URL paths (RFC 3986) — no percent-encoding needed.

A component with no properties contributes just its route key (no colon):

```
/app/dashboard:id=123
```

Here `app` participates in routing for structural purposes but carries no state of its own.

### Full Example

Given this component tree:

```
Dashboard (children: table, search)
├── table: TableDashlet (children: detail)
│   └── detail: DetailPanel (no routed children)
└── search: SearchDashlet (no routed children)
```

The URL:

```
/dashboard:id=123/table:id=10;order=firstName/detail:id=42/search:id=11;query=term
```

Each segment is self-contained — split on `/`, then parse `key:props` independently. The route key is always the part before `:`, making tokenization trivial without tree knowledge.

### Siblings vs Nesting

The URL is a flat sequence of segments. The component tree determines parent-child relationships. Siblings at the same level have unique route keys (enforced by the developer — same constraint as unique variable names). The URL is written in **depth-first order** — a component's children always appear before its siblings.

## Routing API

All three routing methods live on the `Component` base class with full JSDoc signatures. `pushRoute()` and `replaceRoute()` delegate through `this[REACTOR]` to the injected `HistoryRouter` — the same pattern used by `react()`, `broadcast()`, `createChild()`, and other framework methods. If no router is configured on the reactor, the methods throw.

```javascript
// In Component base class (src/component.js)

/**
 * Declare this component's contribution to the URL.
 * Override to opt into routing.
 *
 * Return values:
 * - `false` — not routed; skip this component and its entire subtree
 * - `{}` — structural pass-through; no URL segment, but children are walked
 * - `{ key: value, ... }` — routed; keys become URL property names
 *
 * @returns {false|object} Route state object, empty object for pass-through, or false to opt out
 */
routeState() { return false; }

/**
 * Serialize the full component tree and push a new browser history entry.
 * Use for navigations the user expects to undo with the Back button.
 * Delegates to `this[REACTOR].router`.
 * @throws {Error} If no HistoryRouter is configured on the reactor
 */
pushRoute() {
    this[REACTOR].router.pushUrl();
}

/**
 * Serialize the full component tree and replace the current browser history entry.
 * Use for transient state changes (sort order, filters) that shouldn't clutter history.
 * Delegates to `this[REACTOR].router`.
 * @throws {Error} If no HistoryRouter is configured on the reactor
 */
replaceRoute() {
    this[REACTOR].router.replaceUrl();
}
```

### routeState()

Controls whether a component participates in routing and what it contributes to the URL. Three return shapes:

| Return value | Meaning | URL segment | Walk children? |
|---|---|---|---|
| `false` | Not routed — skip this component **and its entire subtree** | None | No |
| `{}` | Structural pass-through — participates for tree traversal but contributes nothing | None | Yes |
| `{ key: value, ... }` | Routed — keys become URL property names, values become URL property values | Yes | Yes |

```javascript
// Opt-out entirely (default) — subtree is invisible to the router
routeState() { return false; }

// Pass-through — no segment, but routed children are still reachable
routeState() { return {}; }

// Routed — produces a URL segment
routeState() {
    return { id: this.dashboardId, order: this.order, dir: this.direction };
}
```

The framework calls `routeState()` during serialization (building the URL). The return value is also used during deserialization to discover which keys to auto-map back to public vars (see [Auto-Mapping](#auto-mapping-in-update)).

### pushRoute() / replaceRoute()

Trigger a URL update. The framework walks the entire tree from root, calls `routeState()` on every routed component, builds the URL, and calls `history.pushState()` or `history.replaceState()`. Both methods delegate to `this[REACTOR].router` — if no `HistoryRouter` was provided to the reactor, they throw immediately with a clear error.

```javascript
sortBy(column) {
    this.order = column;
    this.replaceRoute();   // no new history entry
    this.react();
}

selectDashboard(id) {
    this.dashboardId = id;
    this.pushRoute();      // new history entry — user can go back
    this.react();
}
```

### Detection

The framework detects routed components by calling `routeState()` and checking the return value:

```
result = component.routeState()
if result === false  → not routed; skip component AND its subtree
if result is object  → routed (or pass-through if empty); walk children
```

The distinction between `false` and `{}` matters for tree traversal. `false` means "I don't participate and neither do my children" — the router never descends into the subtree. `{}` means "I contribute nothing to the URL, but my children might" — the router walks through transparently.

No duck typing, no property checks. Every component has the method — the default just returns `false`.

## Route Segment Accessor

A typed accessor object that components receive in `init()` and `update()`. The developer reads URL values with explicit types — no auto-coercion, no magic.

```javascript
export class RouteSegment {
    /** @type {string} */
    #key;

    /** @type {Map.<string, string>} */
    #properties;

    /**
     * @param {string} key - The route key for this segment
     * @param {Map.<string, string>} properties - Raw key-value pairs from the URL
     */
    constructor(key, properties = new Map()) {
        this.#key = key;
        this.#properties = properties;
    }

    /** @returns {string} the route key for this segment */
    get key() { return this.#key; }

    /**
     * Get a raw string value
     * @param {string} name - Property name
     * @returns {string|null} The value, or null if not present
     */
    get(name) {
        return this.#properties.get(name) ?? null;
    }

    /**
     * Get a string value with a default
     * @param {string} name - Property name
     * @param {string} defaultValue - Fallback if the property is missing
     * @returns {string} The value or the default
     */
    getString(name, defaultValue = '') {
        return this.#properties.get(name) ?? defaultValue;
    }

    /**
     * Get an integer value with a default
     * @param {string} name - Property name
     * @param {number} defaultValue - Fallback if the property is missing or not a number
     * @returns {number} The parsed integer or the default
     */
    getInt(name, defaultValue = 0) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a float value with a default
     * @param {string} name - Property name
     * @param {number} defaultValue - Fallback if the property is missing or not a number
     * @returns {number} The parsed float or the default
     */
    getFloat(name, defaultValue = 0) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        const parsed = parseFloat(raw);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a boolean value with a default
     * @param {string} name - Property name
     * @param {boolean} defaultValue - Fallback if the property is missing
     * @returns {boolean} true if value is "true" or "1", false if "false" or "0", default otherwise
     */
    getBool(name, defaultValue = false) {
        const raw = this.#properties.get(name);
        if (raw === undefined) return defaultValue;
        if (raw === 'true' || raw === '1') return true;
        if (raw === 'false' || raw === '0') return false;
        return defaultValue;
    }

    /**
     * Serialize this segment to a URL path fragment
     * @returns {string} e.g. "dashboard:id=123;view=grid"
     */
    toString() {
        if (this.#properties.size === 0) return this.#key;
        const pairs = [];
        for (const [k, v] of this.#properties) {
            pairs.push(`${k}=${encodeURIComponent(v)}`);
        }
        return `${this.#key}:${pairs.join(';')}`;
    }
}
```

## Lifecycle Integration

Routing plugs into two existing lifecycle hooks. No new hooks are needed.

### init(previousState, routeSegment)

A new optional second parameter. On initial page load (or when a component is created while a URL is active), the framework passes the matching `RouteSegment`. The component reads from it before creating children, so the first render already has the correct state — no flash from defaults to URL values.

```javascript
async init(previousState = null, routeSegment = null) {
    if (routeSegment) {
        this.dashboardId = routeSegment.getString('id');
        this.currentPage = routeSegment.getInt('page', 1);
    }

    // Children are created with the correct parent state — no double render
    this.table = this.createChild('Dashboard/TableDashlet', '10', { ... });
    this.search = this.createChild('Dashboard/SearchDashlet', '11', { ... });
}
```

The framework delivers the segment **before** `init()` runs, so the component can use URL values to decide which children to create, what data to fetch, etc.

### update(newVars, react, routeSegment)

When the URL changes on a **live, already-mounted** component (browser back/forward), the framework calls `update()` with the new `RouteSegment`. This is the same method parents call to push new vars — routing is just another source of state changes.

The full signature is `update(newVars, react = true, routeSegment = null)`. The `react` parameter controls whether `react()` is called automatically (framework callers pass `false` because they handle rendering explicitly). When overriding, always forward all three parameters to `super.update()`:

```javascript
update(newVars, react = true, routeSegment = null) {
    if (routeSegment) {
        const newId = routeSegment.getString('id');
        if (newId !== this.dashboardId) {
            this.dashboardId = newId;
            // Recreate children for the new dashboard
            this.table = this.createChild('Dashboard/TableDashlet', '20', { ... });
            this.search = this.createChild('Dashboard/SearchDashlet', '21', { ... });
        }
    }
    super.update(newVars, react, routeSegment);
}
```

`update()` is async because the component might need to create new children (which involves async `init()` and template loading). The framework awaits it before walking into children — ensuring they exist before trying to route them.

| Caller | `newVars` | `react` | `routeSegment` |
|---|---|---|---|
| Parent pushes new data | `{ order: 'firstName' }` | `true` | `null` |
| URL changes (popstate) | `{}` | `false` | `RouteSegment` |

### Auto-Mapping in update()

When a component does **not** override `update()`, the framework's default implementation auto-maps matching keys:

1. Calls `routeState()` to discover the component's URL key names
2. For each key in the incoming `RouteSegment`: if a public var with that exact name exists, writes the string value
3. Calls `react()` if any value changed

This means a component whose URL keys match its var names needs zero deserialization code — just `routeState()`:

```javascript
export class SearchDashlet extends Component {
    /** @type {string} */
    id = '';

    /** @type {string} */
    query = '';

    /** @type {Array.<object>} */
    results = [];

    routeState() {
        return { id: this.id, query: this.query };
    }

    search(query) {
        this.query = query;
        this.replaceRoute();
        this.react();
    }

    // No update() override needed — framework auto-maps 'id' → this.id, 'query' → this.query
}
```

When key names differ (e.g., URL `id` vs field `dashletId`), or when the component needs side effects (data fetching, child recreation), override `update()` and read from the segment explicitly.

### Why This Simplifies Everything

By using existing lifecycle hooks, the routing API stays minimal:

| Before (event-based) | After (lifecycle-based) |
|---|---|
| `applyRoute(segment)` | Handled by `update(vars, routeSegment)` |
| `routeAliases()` | Moved to router-level i18n (see [translations.md](translations.md)) |
| `child.on('fw-route', ...)` per child | Not needed — framework walks the tree |
| `this.on('fw-route', ...)` for broadcasts | Not needed — framework calls `update()` directly |
| `this.emit('fw-route', state, opts)` | `this.pushRoute()` / `this.replaceRoute()` |

The API is three methods. Everything else is lifecycle.

## Auto-Discovery of Routed Children

The framework discovers routed children by scanning public vars (`Object.keys()`). For each var that holds a `Component` or `Child` instance, it calls `routeState()`:

- Returns `{ ... }` (object with properties) → the child is routed; its var name is the default route key; walk its children
- Returns `{}` (empty object) → the child is a structural pass-through; no segment in the URL, but the framework walks through it to find routed descendants
- Returns `false` → the child is not routed and its entire subtree is skipped

### Mounted Children Only

The DFS walk only visits children whose mount points are currently in the DOM. A child created with `createChild()` but hidden by `fw-if` has no mount point in the rendered template — the framework skips it during tree traversal. This means:

- **Hidden children are excluded from the URL.** If `fw-if="showDetail"` removes the detail panel's mount point, the detail panel produces no URL segment and its subtree is not walked.
- **Reappearing children rejoin the URL.** When `fw-if` becomes truthy and the mount point returns, the child's `routeState()` is called again on the next serialization.
- **No stale segments.** The URL always reflects what the user can currently see and interact with.

The framework already tracks mounted children via `entry.children` on the registry — the router reads this rather than scanning all vars. This ensures consistency between what the DOM shows and what the URL encodes.

### Route Key Resolution

The var name on the parent is the default route key. `this.table` → route key `table`. `this.search` → route key `search`.

For internationalized routes, translation files can map canonical var names to localized URL keys. See [translations.md](translations.md). Components always work with canonical keys internally — the `RouteSegment` delivered to `init()` and `update()` uses canonical keys regardless of the URL's language.

### Constraints

- **Only direct Component references.** Array vars (`this.dashlets = [child1, child2]`) are not scanned. Use individual vars for routed children.
- **Var names must be unique within the parent.** Same constraint as unique variable names in JavaScript.
- **Var order determines URL order.** Public vars are iterated in declaration order (ES2015+ spec). The order in which vars appear in the class body determines the DFS serialization order in the URL.

### Pass-Through

A component that returns `{}` from `routeState()` is invisible in the URL but allows the router to reach its children:

```
App (routeState returns {}) — structural pass-through
└── layout (routeState returns {}) — structural pass-through
    └── Dashboard (routed — returns { id: '123' })
        ├── table: TableDashlet (routed)
        └── search: SearchDashlet (routed)
```

URL: `/dashboard:id=123/table:id=10/search:id=11` — App and layout produce no segments.

A component that returns `false` (the default) stops traversal entirely:

```
App (routeState returns {}) — pass-through
├── Dashboard (routed)
│   └── table: TableDashlet (routed)
└── AdminPanel (routeState returns false) — subtree skipped
    └── settings: Settings (routed, but never reached)
```

URL: `/dashboard:id=123/table:id=10` — AdminPanel and its children are invisible.

## Parsing Algorithm

### Stack-Based DFS Parser

The parser maintains a stack representing the current path down the tree. For each URL segment, it pops the stack until it finds an ancestor that claims the route key as its child. Each level tracks which children it has already consumed.

```
URL: /dashboard:id=123/table:id=10/detail:id=42/search:id=99/search:id=11

Tree knowledge:
  dashboard children: [table, search]
  table children:     [detail, search]
  detail children:    []
  search children:    []

Parsing:

Step 1: "dashboard" → root component
  Stack: [dashboard {remaining: table, search}]

Step 2: "table" → child of stack top (dashboard)? YES, consume
  Stack: [dashboard {remaining: search}, table {remaining: detail, search}]

Step 3: "detail" → child of stack top (table)? YES, consume
  Stack: [..., table {remaining: search}, detail {remaining: —}]

Step 4: "search" → child of stack top (detail)? NO → pop
  → child of stack top (table)? YES, consume
  Stack: [..., table {remaining: —}, search {remaining: —}]

Step 5: "search" → child of stack top (search)? NO → pop
  → child of stack top (table)? table has consumed its "search" already → pop
  → child of stack top (dashboard)? YES, consume
  Stack: [dashboard {remaining: —}, search {remaining: —}]
```

Each segment is pushed and popped at most once — O(n) with the number of segments.

### Unknown Segments (Stale URLs)

When a segment's route key doesn't match any ancestor's remaining children, the parser skips it. This handles stale URLs gracefully after code changes: removed components simply disappear from the tree, and their orphaned URL segments are ignored. The rest of the URL parses normally.

Components that don't find their segment in the URL initialize with defaults — same as a fresh page load with no route state.

## Push vs Replace

`pushRoute()` creates a new browser history entry — the user can press Back to undo. `replaceRoute()` silently replaces the current entry — no Back button clutter.

| Method | History API call | Use case |
|---|---|---|
| `pushRoute()` | `history.pushState()` | Page navigation, item selection — user expects Back to undo |
| `replaceRoute()` | `history.replaceState()` | Sort order, filter toggle, scroll position — transient state |

The calling component decides. No flag propagation, no event forwarding — the framework reads the entire tree when either method is called.

## Initial Page Load

On first load, the tree doesn't exist yet but the URL does. The framework parses the URL into segments, then delivers each segment to the corresponding component via `init(previousState, routeSegment)` as the tree builds.

```
1. HistoryRouter tokenizes the URL into segments
2. Root component is created
   → Framework finds root's segment, passes it to init(null, rootSegment)
   → Root reads its state, creates children
3. Each child is created
   → Framework finds child's segment, passes it to init(null, childSegment)
   → Child reads its state, creates its own children
4. Tree builds progressively, URL is parsed progressively
```

Each component sees its URL state before its first render. No flash from defaults to URL values, no double render.

## The HistoryRouter Module

A decoupled, lightweight orchestrator injected into the `Reactor` at startup, similar to `Persistence`. The `Reactor` calls `router.attach(this)` during initialization, giving the router access to the instance registry. Component methods (`pushRoute`, `replaceRoute`) delegate to the router through `this[REACTOR].router` — no prototype patching, so multiple reactors on the same page each use their own router instance independently.

**Source:** `src/history-router.js`, `src/route-segment.js`, `src/url-service.js`

```javascript
import { Reactor } from './reactor.js';

// Default — hash-bang URLs (#!/path), no server config needed
const reactor = new Reactor('App');

// Clean pathnames — requires server-side SPA catch-all
import { HistoryRouter } from './history-router.js';
import { HistoryUrlService } from './url-service.js';
const reactor2 = new Reactor('App2', {
    router: new HistoryRouter({ urlService: new HistoryUrlService() }),
});

// Custom URL service — for multi-reactor pages, hash routing, or tests
import { UrlService } from './url-service.js';
const customService = new UrlService();
customService.getPath = () => /* read URL from custom source */;
customService.pushPath = (path) => /* push to custom destination */;
customService.replacePath = (path) => /* replace in custom destination */;
customService.onNavigate = (handler) => { /* subscribe */; return () => { /* unsubscribe */ }; };

const reactor3 = new Reactor('App3', {
    router: new HistoryRouter({ urlService: customService }),
});
```

### URL Service Abstraction

All URL reads, writes, and navigation event subscriptions are delegated to a pluggable `UrlService`. This decouples the router from the browser History API, enabling:

- **Multiple reactors on one page** — each reactor gets its own URL service (e.g., one reads from a query parameter, another from a hash fragment)
- **Testing** — inject a fake URL service that stores paths in memory
- **Non-standard URL schemes** — hash-based routing, iframe navigation, etc.

**Source:** `src/url-service.js`

| Class | Description |
|---|---|
| `UrlService` | Abstract base class. Subclass and override all four methods. |
| `HashUrlService` | Default implementation using hash-bang URLs (`#!/path`). No server config needed. Uses `history.pushState/replaceState` for writes, `hashchange` for navigation. |
| `HistoryUrlService` | Clean pathname URLs using `window.location` + `history.pushState/replaceState` + `popstate`. Requires a server-side SPA catch-all. |

| Method | Description |
|---|---|
| `getPath()` | Return the current URL path (e.g., `/home:demo=Counter`). |
| `pushPath(path)` | Push a new history entry with the given path. |
| `replacePath(path)` | Replace the current history entry with the given path. |
| `onNavigate(handler)` | Subscribe to external navigation events. Returns an unsubscribe function. |

### Key Methods

| Method | Visibility | Description |
|---|---|---|
| `attach(reactor)` | Public | Called by Reactor during construction. Tokenizes current URL via URL service, sets up navigation listener. |
| `pushUrl()` | Public | Serializes tree and pushes via URL service. Called by `Component.pushRoute()`. |
| `replaceUrl()` | Public | Serializes tree and replaces via URL service. Called by `Component.replaceRoute()`. |
| `consumeRootSegment()` | Public | Returns the root segment during initial load. Called by `Reactor.start()`. |
| `consumeSegment(routeKey)` | Public | Returns matching child segment during initial load. Called by `InstanceRegistry._mountChild()`. |
| `completeInitialLoad()` | Public | Marks initial load as done. Called by `Reactor.start()` after root is mounted. |
| `#onPopState()` | Private | Handles browser back/forward: tokenizes URL, assigns segments, delivers via `update()`. |
| `#serialize()` | Private | DFS tree walk building the full URL from `routeState()` calls. |
| `#assignSegments(segments)` | Private | Stack-based DFS parser mapping URL segments to component codes. Expands pass-through components transparently. |

### Lifecycle Wiring

The router integrates with the instance registry at three points:

1. **Root creation** (`Reactor.start()`): Consumes the root segment and passes it to `createFromReference()` → `create()` → `init(null, routeSegment)`.

2. **Child creation** (`InstanceRegistry._mountChild()`): For non-eager children, finds the var name (route key), consumes the matching segment, and passes it through `createFromReference()` → `create()` → `init(null, routeSegment)`. For eagerly-created children, the segment is delivered via `update()` + re-render in the detached container before DOM transfer (in `_attachEagerChild()`).

3. **Popstate** (`HistoryRouter.#onPopState()`): Tokenizes the new URL, uses the stack-based parser to assign segments to component codes, then walks the tree top-down calling `InstanceRegistry.update(componentId, {}, routeSegment)` on each routed component.

## Implementation Examples

### Example 1: Simple Routed Component (Pagination)

A Pagination component that syncs its current page with the URL. Changing the page replaces the URL (no back-button clutter). Selecting a new category pushes a new entry.

**Component tree:**

```
ItemList (children: pagination)
└── pagination: Pagination
```

**URL:** `/items:category=shoes/pagination:page=3`

**Pagination.js:**

```javascript
import { Component } from '/js/component.js';

export class Pagination extends Component {
    /** @type {number} */
    currentPage = 1;

    /** @type {number} */
    totalPages = 1;

    routeState() {
        return { page: String(this.currentPage) };
    }

    async init(previousState = null, routeSegment = null) {
        if (routeSegment) {
            this.currentPage = routeSegment.getInt('page', 1);
        }
    }

    update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            this.currentPage = routeSegment.getInt('page', 1);
        }
        super.update(newVars, react, routeSegment);
    }

    /**
     * User clicks "next page"
     */
    nextPage() {
        this.currentPage++;
        this.replaceRoute();
        this.react();
    }

    /**
     * User clicks "previous page"
     */
    prevPage() {
        if (this.currentPage <= 1) return;
        this.currentPage--;
        this.replaceRoute();
        this.react();
    }

    /**
     * User clicks a specific page number
     * @param {number} page - Target page
     */
    goToPage(page) {
        this.currentPage = page;
        this.replaceRoute();
        this.react();
    }
}
```

**ItemList.js (parent):**

```javascript
import { Component } from '/js/component.js';

export class ItemList extends Component {
    /** @type {string} */
    category = '';

    /** @type {Array.<object>} */
    items = [];

    /** @type {import('./Pagination.js').Pagination} */
    pagination = null;

    routeState() {
        return { category: this.category };
    }

    async init(previousState = null, routeSegment = null) {
        if (routeSegment) {
            this.category = routeSegment.getString('category');
        }

        this.pagination = /** @type {import('./Pagination.js').Pagination} */ (
            this.createChild('ItemList/Pagination', 'pagination', {
                currentPage: 1,
                totalPages: 10,
            })
        );

        this.#fetchItems();
    }

    update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            const newCategory = routeSegment.getString('category');
            if (newCategory !== this.category) {
                this.category = newCategory;
                this.#fetchItems();
            }
        }
        super.update(newVars, react, routeSegment);
    }

    /**
     * User selects a different category — new history entry
     * @param {string} category - The selected category
     */
    selectCategory(category) {
        this.category = category;
        this.pushRoute();
        this.#fetchItems();
        this.react();
    }

    #fetchItems() {
        // fetch items based on this.category...
    }
}
```

No event listeners, no forwarding. ItemList and Pagination each handle their own routing independently.

### Example 2: Dashboard with Sibling Dashlets

A dashboard with two independently-routed dashlets and nested detail panel.

**Component tree:**

```
Dashboard (children: table, search)
├── table: TableDashlet (children: detail)
│   └── detail: DetailPanel
└── search: SearchDashlet
```

**URL:** `/dashboard:id=123/table:id=10;order=firstName/detail:id=42/search:id=11;query=term`

**Dashboard.js:**

```javascript
import { Component } from '/js/component.js';

export class Dashboard extends Component {
    /** @type {string} */
    dashboardId = '';

    /** @type {import('./TableDashlet.js').TableDashlet} */
    table = null;

    /** @type {import('./SearchDashlet.js').SearchDashlet} */
    search = null;

    routeState() {
        return { id: this.dashboardId };
    }

    async init(previousState = null, routeSegment = null) {
        if (routeSegment) {
            this.dashboardId = routeSegment.getString('id');
        }

        this.table = /** @type {import('./TableDashlet.js').TableDashlet} */ (
            this.createChild('Dashboard/TableDashlet', '10', {
                dashletId: '10', order: 'name', direction: 'asc',
            })
        );
        this.search = /** @type {import('./SearchDashlet.js').SearchDashlet} */ (
            this.createChild('Dashboard/SearchDashlet', '11', {
                dashletId: '11', query: '',
            })
        );
    }

    update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            const newId = routeSegment.getString('id');
            if (newId !== this.dashboardId) {
                this.dashboardId = newId;
                // Different dashboard — recreate children
                this.table = /** @type {import('./TableDashlet.js').TableDashlet} */ (
                    this.createChild('Dashboard/TableDashlet', '20', { ... })
                );
                this.search = /** @type {import('./SearchDashlet.js').SearchDashlet} */ (
                    this.createChild('Dashboard/SearchDashlet', '21', { ... })
                );
            }
        }
        super.update(newVars, react, routeSegment);
    }

    /**
     * User navigates to a different dashboard
     * @param {string} id - Dashboard ID
     */
    selectDashboard(id) {
        this.dashboardId = id;
        this.pushRoute();
        this.react();
    }
}
```

**TableDashlet.js:**

```javascript
import { Component } from '/js/component.js';

export class TableDashlet extends Component {
    /** @type {string} */
    dashletId = '';

    /** @type {string} */
    order = 'name';

    /** @type {string} */
    direction = 'asc';

    /** @type {Array.<object>} */
    rows = [];

    /** @type {import('./DetailPanel.js').DetailPanel} */
    detail = null;

    routeState() {
        return { id: this.dashletId, order: this.order, dir: this.direction };
    }

    async init(previousState = null, routeSegment = null) {
        if (routeSegment) {
            this.dashletId = routeSegment.getString('id');
            this.order = routeSegment.getString('order', 'name');
            this.direction = routeSegment.getString('dir', 'asc');
        }

        this.detail = /** @type {import('./DetailPanel.js').DetailPanel} */ (
            this.createChild('Dashboard/DetailPanel', 'detail', { itemId: '' })
        );
    }

    update(newVars, react = true, routeSegment = null) {
        if (routeSegment) {
            this.dashletId = routeSegment.getString('id');
            this.order = routeSegment.getString('order', 'name');
            this.direction = routeSegment.getString('dir', 'asc');
        }
        super.update(newVars, react, routeSegment);
    }

    /**
     * User clicks a column header — replaces URL, no back-button entry
     * @param {string} column - Column name to sort by
     */
    sortBy(column) {
        if (this.order === column) {
            this.direction = this.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.order = column;
            this.direction = 'asc';
        }
        this.replaceRoute();
        this.react();
    }

    /**
     * User clicks a row — pushes new URL entry
     * @param {string} itemId - The selected item's ID
     */
    openDetail(itemId) {
        this.detail.update({ itemId });
        this.pushRoute();
        this.react();
    }
}
```

**SearchDashlet.js (auto-mapped — no update override needed):**

```javascript
import { Component } from '/js/component.js';

export class SearchDashlet extends Component {
    /** @type {string} */
    id = '';

    /** @type {string} */
    query = '';

    /** @type {Array.<object>} */
    results = [];

    routeState() {
        return { id: this.id, query: this.query };
    }

    async init(previousState = null, routeSegment = null) {
        if (routeSegment) {
            this.id = routeSegment.getString('id');
            this.query = routeSegment.getString('query');
        }
        if (this.query) this.#executeSearch();
    }

    // No update() override — URL keys 'id' and 'query' match var names exactly.
    // Framework auto-maps on popstate: this.id = segment value, this.query = segment value.

    /**
     * User types in the search box
     * @param {string} query - The search term
     */
    search(query) {
        this.query = query;
        this.replaceRoute();
        this.#executeSearch();
        this.react();
    }

    #executeSearch() {
        // fetch results based on this.query...
    }
}
```

### Example 3: Complete Flow Walkthrough

**1. Initial page load — URL: `/dashboard:id=123/table:id=10;order=name/search:id=11`**

```
HistoryRouter tokenizes URL → [dashboard(id=123), table(id=10,order=name), search(id=11)]

Dashboard created:
  → init(null, RouteSegment{id=123})
  → sets this.dashboardId = '123'
  → creates children: table, search

TableDashlet created:
  → init(null, RouteSegment{id=10, order=name})
  → sets this.order = 'name'
  → creates child: detail

DetailPanel created:
  → init(null, null) — no segment in URL
  → uses defaults

SearchDashlet created:
  → init(null, RouteSegment{id=11})
  → no query in URL → uses default

Every component renders once with correct state. No flash.
```

**2. User sorts the table by "firstName" — replaces URL**

```
TableDashlet.sortBy('firstName'):
  → this.order = 'firstName', this.direction = 'asc'
  → this.replaceRoute()
  → this.react()

Framework serializes the tree:
  Dashboard.routeState() → {id: '123'}
  TableDashlet.routeState() → {id: '10', order: 'firstName', dir: 'asc'}
  DetailPanel.routeState() → {itemId: ''} (or false if empty)
  SearchDashlet.routeState() → {id: '11', query: ''}

URL: /dashboard:id=123/table:id=10;order=firstName;dir=asc/search:id=11
history.replaceState() — no new history entry
```

**3. User clicks row to open detail — pushes new URL**

```
TableDashlet.openDetail('42'):
  → this.detail.update({itemId: '42'})
  → this.pushRoute()
  → this.react()

URL: /dashboard:id=123/table:id=10;order=firstName;dir=asc/detail:id=42/search:id=11
history.pushState() — new history entry
```

**4. User presses Back**

```
popstate fires → HistoryRouter._onPopState()

Previous URL: /dashboard:id=123/table:id=10;order=firstName;dir=asc/search:id=11
(no detail segment)

Framework walks the tree top-down:
  → await InstanceRegistry.update(Dashboard, {}, RouteSegment{id=123}) → no change
  → await InstanceRegistry.update(TableDashlet, {}, RouteSegment{id=10, order=firstName, dir=asc}) → no change
  → DetailPanel receives null segment → resets to defaults
  → await InstanceRegistry.update(SearchDashlet, {}, RouteSegment{id=11}) → no change

Detail panel closes. Table stays sorted. Search unchanged.
```

## Edge Cases

### Stale URLs after code changes

A component is removed or renamed. The old URL contains segments the new code doesn't recognize. The parser skips unknown segments. Components missing from the URL initialize with their default state.

### Route key moves to a different level

A `settings` panel moves from being a child of `detail` to a direct child of `dashboard`. Old URLs place `settings` deep in the tree. The new parser pops the stack past `detail` (which no longer claims `settings`) and `dashboard` claims it instead.

### Non-routed components (opt-out vs pass-through)

Components that return `false` from `routeState()` (the default) opt out of routing entirely — they produce no URL segments and their entire subtree is skipped. Components that return `{}` are structural pass-throughs — they produce no URL segments but the framework walks through them to reach routed descendants. This distinction lets you choose between "this whole section is unroutable" (`false`) and "I'm just a layout wrapper, let the router reach my children" (`{}`).

### Encoded values

Property values may contain characters that need percent-encoding in URLs (spaces, special characters). Standard `encodeURIComponent` / `decodeURIComponent` applies to values. Route keys and property keys should be restricted to URL-safe identifiers (`[a-z][a-z0-9-]*`).

### Empty route state on popstate

When a component was in the URL previously but isn't in the new URL (e.g., the detail panel after pressing Back), the framework passes an empty `RouteSegment` (no properties) as the `routeSegment` in `update()`. The component can detect this by checking for missing properties and should reset to its default state or do nothing, depending on its semantics. A non-null `routeSegment` always means "this is a route-driven update" — even when the segment has no properties.

## Future: Internationalized Routes

See [translations.md](translations.md) for the full design. Summary:

- Translation files live alongside components: `MyComponent.en.json`, `MyComponent.es-ar.json`
- The router translates between canonical keys (var names, property names) and localized URL keys
- Components always work with canonical keys — `RouteSegment` uses canonical keys regardless of locale
- Language can be switched without losing the URL — the router re-serializes with the new locale's translations
- Locale is determined per-app (e.g., from a URL prefix like `/es-ar/...` or from app configuration)

## Next Steps

1. **Build a canonical test component** (e.g., dashboard with sortable dashlets) to validate the full loop: initial load → user interaction → URL update → back button → state restore.
2. **Integration tests.** Playwright tests in `test/browser/` simulating back/forward navigation, stale URL handling, and deep-linked page loads.
3. **Handle SSR overlaps.** The `init(previousState, routeSegment)` flow should prevent flash naturally — verify with `fusewire-php`.
4. **Internationalized routes.** See [translations.md](translations.md) for the full design.
