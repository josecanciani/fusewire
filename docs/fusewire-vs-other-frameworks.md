# FuseWire vs Other Frameworks

## Overview

FuseWire is an opinionated component framework with design decisions that diverge from mainstream UI frameworks. This document compares FuseWire's approach to React, Vue, Svelte, Angular, and Lit — highlighting where FuseWire agrees, disagrees, and why.

## At a Glance

| Aspect | FuseWire | React | Vue | Svelte | Angular | Lit |
|--------|----------|-------|-----|--------|---------|-----|
| Rendering | DOM morphing | Virtual DOM | Virtual DOM | Compiled reactivity | Incremental DOM | Lit-html templates |
| Components | ES6 classes | Functions (hooks) | SFCs / Options API | SFCs / Runes | TypeScript classes + decorators | ES6 classes + decorators |
| Templates | Separate HTML files | JSX (in JS) | SFCs (HTML-like) | SFCs (HTML-like) | Separate HTML files | Tagged template literals (in JS) |
| State | Public class fields | useState / useReducer | ref() / reactive() | $state rune / let | Signals / RxJS | @property decorator |
| Reactivity | Explicit `react()` | Automatic on setState | Automatic on ref change | Compiled auto-tracking | Zone.js / Signals | Automatic on property change |
| Build step | None | Required | Required | Required | Required | Optional |
| Styling | Separate CSS, auto-scoped | CSS-in-JS / modules | Scoped `<style>` in SFC | Scoped `<style>` in SFC | ViewEncapsulation | Scoped via Shadow DOM |
| Child rendering | `((varName))` mount points | `{children}` / JSX | `<slot>` / `<component>` | `<slot>` / `{#each}` | `<ng-content>` / `*ngFor` | `<slot>` (Shadow DOM) |
| Routing | Tree-wide state serialization | Path-based (React Router) | Path-based (Vue Router) | File-system (SvelteKit) | Path-based (Angular Router) | None built-in |
| Live updates | Zero-downtime, production | Dev-only HMR (bundler) | Dev-only HMR (bundler) | Dev-only HMR (bundler) | Dev-only HMR (CLI) | None built-in |

## Template Approach

### FuseWire: Separate files, plain HTML

Templates are standalone `.html` files with a minimal directive set (`fw-if`, `fw-each`, `((var))`). CSS lives in a separate `.css` file. JS owns behavior only.

```html
<!-- Counter.html -->
<div class="counter">
    <span>((count))</span>
    <button onclick="((this)).increment()">+</button>
</div>
```

### Why this matters

**Separation of concerns** is enforced at the file level. JS files never contain CSS class names or HTML structure. This constraint prevents the "God component" pattern where a single file grows to hundreds of lines mixing markup, styling, and logic.

Most modern frameworks move in the opposite direction — colocating HTML, CSS, and JS in single-file components (Vue, Svelte) or embedding markup in JS (React JSX, Lit tagged templates). FuseWire argues that colocation trades long-term maintainability for short-term convenience.

**Comparison:**
- **React (JSX):** Markup lives inside JS. Enables powerful composition but couples presentation to logic.
- **Vue/Svelte (SFCs):** Three sections in one file (`<template>`, `<script>`, `<style>`). A middle ground — sections are separated but colocated.
- **Angular:** Also uses separate template files (`.html`). Closest to FuseWire's approach.
- **Lit:** Templates are JS tagged template literals — markup is code.

## Reactivity Model

### FuseWire: Explicit `react()`

FuseWire uses **explicit reactivity**. Components update their state (public class fields), then call `this.react()` to trigger a re-render. The framework never watches properties or intercepts assignments.

```javascript
increment() {
    this.count += 1;
    this.react();
}
```

### Why this matters

Explicit reactivity means **no magic**. There are no proxies wrapping your objects, no compiler transforms rewriting assignments, no zone patching of async APIs. You always know exactly when a render happens and why. Debugging is straightforward — set a breakpoint on `react()`.

The cost is verbosity: you must remember to call `react()`. The benefit is predictability: renders never happen accidentally.

**Comparison:**
- **React:** Semi-explicit. `setState()` / `useState` setter triggers renders. But batching, concurrent mode, and Suspense add implicit scheduling.
- **Vue:** Automatic via Proxy-based reactivity. Assigning to a `ref` triggers a render. Convenient but introduces hidden behavior — mutating a deeply nested property "just works" via proxy interception.
- **Svelte:** Automatic via compiler transforms. `count += 1` in a Svelte component is rewritten at build time to include an invalidation call. Elegant but requires a build step and the reactivity rules (e.g., array mutations) can surprise developers.
- **Angular:** Historically Zone.js (patches all async APIs to detect changes). Moving toward explicit Signals, which is closer to FuseWire's model.
- **Lit:** Automatic on decorated `@property` changes. Similar to Vue but simpler — no deep reactivity.

## No Build Step

### FuseWire: Native ES modules, zero tooling

FuseWire runs directly in the browser using native ES module `import`/`export`. No transpilation, no bundling, no webpack/vite/rollup. Templates are fetched at runtime as plain files.

### Why this matters

The development experience is immediate: edit a file, refresh the browser. No build process means no build configuration, no version conflicts between build tools, and no waiting for compilation.

The trade-off is no tree-shaking, no minification, and no compile-time optimizations (like Svelte's compiled reactivity). FuseWire accepts this trade-off because it targets applications where developer velocity matters more than bundle size.

**Comparison:**
- **React:** Requires a build step (Babel/SWC for JSX, bundler for modules). Create React App, Next.js, Vite all add tooling layers.
- **Vue:** Requires a build step for SFCs. The Options API can work without builds but loses SFC benefits.
- **Svelte:** Requires a build step (the compiler IS the framework — it generates vanilla JS at compile time).
- **Angular:** Requires a build step (TypeScript compilation, AOT template compilation).
- **Lit:** Can work without a build step (like FuseWire), though most projects add one for TypeScript and optimization.

## DOM Updates

### FuseWire: DOM morphing via Idiomorph

FuseWire generates an HTML string from the template, then uses Idiomorph to morph the existing DOM to match. This is neither Virtual DOM nor direct DOM manipulation — it's **declarative DOM patching**.

### Why this matters

DOM morphing is conceptually simpler than Virtual DOM diffing. There's no intermediate tree representation, no fiber architecture, no reconciliation algorithm. The morph library compares the real DOM to the desired HTML string and makes minimal changes.

Child component mount points are excluded from morphing (preserved as-is), so component boundaries are always respected.

**Comparison:**
- **React:** Virtual DOM. Builds an in-memory tree, diffs it against the previous tree, then applies patches. Powerful (enables concurrent rendering, Suspense) but complex and memory-intensive.
- **Vue:** Virtual DOM (similar to React). Vue 3's compiler optimizes the diff by marking static nodes.
- **Svelte:** No Virtual DOM. The compiler generates targeted DOM update instructions at build time. Most efficient approach but requires compilation.
- **Angular:** Incremental DOM. Similar to morphing but walks the template in order, creating/updating nodes incrementally.
- **Lit:** Lit-html uses template literals with tagged functions. Updates are fast because it only re-evaluates the dynamic parts (the "holes" in the template). No full tree diff.

## Component Model

### FuseWire: ES6 classes with lifecycle hooks

Components are plain ES6 classes extending `Component`. State is public class fields. Lifecycle hooks are methods (`init`, `hydrate`, `afterRender`, `destroy`).

```javascript
class Counter extends Component {
    /** @type {number} */
    count = 0;

    increment() {
        this.count += 1;
        this.react();
    }
}
```

### Why this matters

Classes provide a natural encapsulation boundary. Private state uses native `#` fields. Public vars are plain properties — no wrappers, no proxies, no special accessors. JSDoc type annotations provide IDE support without TypeScript compilation.

FuseWire also enforces **no setters** — objects are configured at construction, not mutated via setter methods. This pushes toward a more functional, predictable design.

**Comparison:**
- **React:** Moved from classes to functions + hooks. `useState`, `useEffect`, `useMemo` replace lifecycle methods. The hooks model is powerful but introduces closure-based gotchas (stale closures, dependency arrays).
- **Vue:** Options API (object-based) or Composition API (function-based with `ref`/`reactive`). The Options API is similar to FuseWire's class model.
- **Svelte:** No classes. Components are `.svelte` files where top-level `let` variables are state. With Svelte 5, Runes (`$state`, `$derived`) add explicit reactivity primitives.
- **Angular:** TypeScript classes with decorators (`@Component`, `@Input`). Most similar to FuseWire's class-based model, but heavily decorated.
- **Lit:** ES6 classes with decorators (`@property`, `@customElement`). Very similar to FuseWire's model, but uses Shadow DOM and custom elements.

## Event System

### FuseWire: Pub/sub with buffered subscriptions

Child-to-parent communication uses `emit()` / `on()`. Subscriptions are **buffered** on `Child` references — you can subscribe before the child component exists, and the framework replays subscriptions when the child mounts.

```javascript
// Parent
this.sidebar = this.createChild('Sidebar', 'main');
this.sidebar.on('select', (item) => this.selectItem(item));

// Child
selectItem(item) {
    this.emit('select', item);
}
```

FuseWire also supports **top-down broadcasts** — events that propagate from parent to children through the tree.

### Why this matters

Buffered subscriptions solve a timing problem that affects most frameworks: the child doesn't exist yet when the parent wants to subscribe. In React, this is solved by passing callbacks as props. In Vue, by `$emit` + `v-on`. FuseWire's approach keeps the subscription on the reference object, decoupling subscription timing from component creation.

**Comparison:**
- **React:** Callbacks passed as props. No built-in pub/sub. Custom events or context API for cross-tree communication.
- **Vue:** `$emit` + `v-on` directive. Template-based — subscriptions are declared in the parent's template, not JS.
- **Svelte:** `dispatch()` + `on:event` directive. Similar to Vue. Svelte 5 uses `$props` callback pattern.
- **Angular:** `@Output()` + EventEmitter. Class-based like FuseWire but uses decorators and observables.
- **Lit:** DOM custom events (`dispatchEvent`). Leverages the platform's native event system.

## Child Component Rendering

### FuseWire: Data-driven mount points

Children are declared in JS (via `createChild()`) and rendered as `((varName))` in the template. The framework discovers mount points in the DOM and attaches the pre-created children.

```javascript
// JS owns the data
this.sidebar = this.createChild('Sidebar', 'main', { items: this.items });
```

```html
<!-- Template owns the structure -->
<div class="layout">
    ((sidebar))
    <main>((content))</main>
</div>
```

Children are **eagerly created in parallel** — `createChild()` starts loading the class, template, and running `init()` immediately, in a detached container. When the parent renders and the mount point appears, the pre-rendered child is attached to the document.

### Why this matters

This is fundamentally different from React/Vue/Svelte where child components are instantiated declaratively in the template/JSX. FuseWire's approach means the JS layer decides WHICH children exist, and the template decides WHERE they render.

This enables patterns like: create 10 children in parallel during `init()`, then the template's `fw-each` renders them — all 10 are already initialized by the time the DOM needs them.

**Comparison:**
- **React:** Children declared in JSX. Creation happens during render. No pre-creation.
- **Vue:** `<ChildComponent :prop="val" />` in template. Instantiation tied to template rendering.
- **Svelte:** `<Child {prop} />` in markup. Same as Vue.
- **Angular:** `<app-child [prop]="val">` in template. Same pattern.
- **Lit:** Children rendered in template literals or via slots. Same pattern.

## Styling

### FuseWire: Auto-scoped CSS via container classes

CSS lives in separate `.css` files. The framework automatically scopes CSS by "boxing" your stylesheet — wrapping selectors with `.appName .componentName { ... }` using native CSS nesting. No Shadow DOM, no CSS modules, no CSS-in-JS.

### Why this matters

- **Standard Tooling:** Standard CSS tooling works without plugins.
- **Predictable Specificity:** CSS specificity is predictable (just one extra nesting level).
- **Unidirectional Dependency:** Encourages an architecture where parents know their children (and can override their styles) but children never know their parents. This keeps the dependency tree clear and prevents "conditional rendering based on parent" logic inside components.
- **Zero-Tooling:** No build step required to generate unique class names or hash attributes.
- **Platform First:** Leverages native browser CSS inheritance. Since components are boxed rather than tagged with unique attributes, global context (like themes) is shared via CSS Variables inherited from parent containers.

**Comparison:**
- **React:** No built-in scoping. Developers must choose between CSS Modules, styled-components, or utility-first CSS (Tailwind).
- **Vue / Svelte:** Use "Attribute Tagging" (injecting `[data-v-hash]` into every tag). This is powerful as it allows components to easily target global attributes, but it makes the HTML noisier and requires a compilation step.
- **FuseWire:** Uses "Container Boxing". It keeps the HTML extremely clean and requires no build step. To handle global state like themes, it encourages the use of CSS Variables inherited from a themed root component.
- **Angular:** ViewEncapsulation (emulated Shadow DOM via attribute selectors, or real Shadow DOM).
- **Lit:** Shadow DOM for style encapsulation. True isolation but makes global styling and variable inheritance more intentional.

## Portals

### FuseWire: PortalHost + PortalChild pattern

FuseWire implements portals via two built-in components. A `PortalHost` renders children via `fw-each` anywhere in the DOM tree. A `PortalChild` acts as an invisible proxy in the original component's tree, forwarding events between the logical parent and the physical child. See [portals.md](portals.md) for the full design.

**Comparison:**
- **React:** `ReactDOM.createPortal(children, container)`. Renders children into a different DOM node while preserving the React tree for events. Simpler API but tightly coupled to ReactDOM.
- **Vue:** `<Teleport to="body">`. Built-in component that moves content to a target selector. Declarative and clean.
- **Angular:** `cdkPortal` / `cdkPortalOutlet` from CDK. More infrastructure than React/Vue but flexible.
- **Svelte:** No built-in portals. Community solutions use `document.body.appendChild()` manually.
- **Lit:** No built-in portals. Manual DOM manipulation or community mixins.

## Routing

### FuseWire: Component tree serialization — full app state in the URL

FuseWire's `HistoryRouter` serializes the entire component tree into URL path segments. Each component declares what state it contributes to the URL via a `routeState()` method. The router discovers routed components automatically by walking the mounted tree — there is no centralized route config.

```javascript
class SearchDashlet extends Component {
    id = '';
    query = '';
    sortBy = 'name';
    results = [];  // not routed — fetched data

    routeState() {
        return { id: this.id, query: this.query, sortBy: this.sortBy };
    }
}
```

This produces URL segments like `/search:id=11;query=term;sortBy=date`. A deeply nested tree serializes naturally:

```
/dashboard:id=123/table:id=10;order=firstName/detail:itemId=42/search:id=11;query=term
```

### Why this matters

The URL becomes a **complete snapshot of the application's state** — not just which page you're on, but what you're looking at. Any state the developer exposes via `routeState()` survives a page reload, a link share, or a browser back/forward navigation:

- **Unsaved form inputs** — a half-typed search query, a draft filter configuration
- **Pagination and sort state** — current page, sort column, sort direction
- **UI state** — which panels are expanded, which tab is selected, which item is focused
- **Scroll positions** — if stored as a component var

When a user shares a URL, the recipient sees the exact same application state. When the user hits back, every routed component at every depth receives its previous values and re-renders — no flash, no data loss.

This works because restoration is built into the component lifecycle. On initial load, each component receives a `RouteSegment` in `init()` before the first render — so the UI never shows stale defaults. On popstate (back/forward), the framework auto-maps URL values back to component vars via `update()`:

```javascript
// This is the default update() behavior — no override needed.
// For each key in routeState(), the framework reads the URL value
// and assigns it. Missing keys reset to their pre-init defaults.
update(newVars, react = true, routeSegment = null) {
    if (routeSegment) {
        const state = this.routeState();
        for (const key of Object.keys(state)) {
            const value = routeSegment.get(key);
            this[key] = value !== null ? value : defaults[key];
        }
    }
}
```

The router also keeps URLs clean: properties that match their pre-init defaults are omitted from the URL. A component with `currentPage = 1` (the default) produces no `page` segment; navigate to page 3 and only then does `page=3` appear.

Components opt into routing granularly — `routeState()` returning `false` (the default) opts out entirely, returning `{}` makes a pass-through that lets children be routed without contributing state, and returning properties opts in. No route table, no file-system conventions, no decorators.

**Comparison:**
- **React:** React Router — path-based route matching. Components are mapped to URL path segments via a centralized route config. Component-level state (form inputs, sort orders) is not part of the routing system — developers manually sync state to query params or use a separate state management layer.
- **Vue:** Vue Router — similar to React Router. Path-based with nested routes. Query parameters are available but not automatically synchronized with component state.
- **Svelte:** SvelteKit — file-system routing. Path segments map to directory structure. Form state and deep component state are not part of the routing model.
- **Angular:** Angular Router — path-based with lazy loading and guards. Most full-featured traditional router, but route config is centralized and component state requires manual synchronization.
- **Lit:** No built-in router. Community solutions.

In all of these frameworks, routing answers the question "which page am I on?" In FuseWire, routing answers the question "what is the entire application doing right now?" — and the answer is in the URL.

## Live Component Updates

### FuseWire: Zero-downtime updates without browser refresh

Because `createChild()` decouples component creation from template rendering, FuseWire can update running components live — in production, not just during development. The template store re-fetches files using ETags, detects content changes via hash comparison, and the framework seamlessly recreates affected components with their new template and JS — all without a page reload.

The update cycle:

1. The template store re-fetches HTML, CSS, and JS with conditional requests (ETags). All three are fetched in parallel.
2. If any file changed, a new content hash (version) is computed from the concatenated content.
3. The old component instance is destroyed — its public vars and the return value of `destroy()` are captured into the persistence store.
4. A new instance is created with the updated template/JS. The framework restores the saved state automatically.
5. If the new version expects a different state shape, the component's static `migrateVars()` transforms the old vars before they are applied.

```javascript
class Dashboard extends Component {
    static migrateVars(vars) {
        // v2 renamed "userName" to "displayName"
        if ('userName' in vars) {
            vars.displayName = vars.userName;
            delete vars.userName;
        }
        return vars;
    }
}
```

### Why this matters

This is **live application updating** — not dev-time hot reload. Production users receive new features and bug fixes delivered to their running session without a refresh prompt, without losing their scroll position, form state, or in-progress work.

The key enabler is `createChild()`. Because the JS layer — not the template — owns the component creation lifecycle, the framework can transparently destroy and recreate any component at any depth in the tree. The template just declares mount points (`((varName))`); it never directly instantiates children. This means the framework controls the entire swap: capture state, tear down old instance, stand up new instance with updated code, restore state, re-render.

In other frameworks, HMR is a development-time convenience layered on top of the build toolchain. It does not ship to production.

**Comparison:**
- **React:** HMR via React Refresh (Vite/webpack plugin). Dev-only — relies on the bundler to replace modules at runtime. State preservation is heuristic-based and limited to hooks; structural changes cause a full remount.
- **Vue:** HMR via Vite's built-in Vue plugin. Dev-only. Component state is preserved when possible but resets on structural changes.
- **Svelte:** HMR via Vite. Dev-only. State preservation behavior varies by change type.
- **Angular:** HMR via Angular CLI. Dev-only. Limited to style/template changes — component logic changes require a full reload.
- **Lit:** No built-in HMR. Community solutions exist for dev-time only.

All of these require a build step and a dev server. FuseWire's approach works in production because it was designed into the architecture from the start: runtime template fetching, content-hash versioning, state persistence across destroy/create cycles, and `migrateVars()` for schema evolution.

## Summary

FuseWire's core philosophy can be summarized as:

1. **Explicit over implicit** — `react()` over auto-tracking, separate files over colocation, class fields over proxied state
2. **Platform-native over abstraction** — ES modules over bundlers, CSS nesting over CSS-in-JS, DOM morphing over Virtual DOM
3. **Data drives UI** — JS decides what exists, templates decide how it looks, CSS decides how it's styled
4. **No build step** — trade compile-time optimization for zero-config developer experience
5. **Live updates in production** — runtime template fetching + state persistence + `migrateVars()` enable zero-downtime component updates without browser refresh

These are deliberate trade-offs. FuseWire is not trying to be the most efficient or the most convenient — it's trying to be the most **predictable** and **debuggable**, while keeping the developer experience as close to plain HTML/CSS/JS as possible.
