# Component Lifecycle

## Overview

Components in FuseWire follow a well-defined lifecycle with hooks at key points. Understanding this lifecycle is essential for building robust components.

## Lifecycle Hooks

### `constructor(vars)`

**When:** Component instance is created  
**Type:** Synchronous  
**Purpose:** Initialize component instance

```js
constructor(vars = {}) {
  super(vars);
  this.myInternalState = {};
}
```

**Guidelines:**
- Call `super(vars)` first
- Set up internal state
- Don't perform async operations here
- Don't access DOM (componentContainer not set yet)

---

### `async init()`

**When:** After vars are set/updated, before first render  
**Type:** Async  
**Purpose:** Perform async initialization, declare children, load libraries

```js
async init() {
  // Create child components (start loading in parallel)
  this.sidebar = this.createChild('Sidebar', 'main', { items: [] });
  this.sidebar.on('select', (id) => this.selectItem(id));

  // Load libraries (non-blocking)
  this.loadLibrary('ChartLib', 'Chart');

  // Fetch initial data
  const data = await fetch('/api/data').then(r => r.json());
  this.items = data.items;
}
```

**Guidelines:**
- Safe for async operations (fetch, timers, etc.)
- Can modify component properties before render
- Create children with `createChild()` — they start loading immediately in the background
- Subscribe to child events with `.on()` — calls are buffered and replayed when the child mounts
- Load libraries with `loadLibrary()` — non-blocking, access via `this.library()` in `hydrate()`
- Don't access DOM directly (element may be detached — use `hydrate()` instead)

---

### `update(newVars, react = true)`

**When:** Called to merge new vars into the component  
**Type:** Synchronous  
**Purpose:** Merge vars, optionally trigger re-render; override for custom logic

```js
update(newVars, react = true) {
  const oldSearch = this.search;
  super.update(newVars, react);
  
  if (oldSearch !== this.search) {
    console.log('Search changed:', oldSearch, '->', this.search);
    this.performSearch();
  }
}
```

**Guidelines:**
- Always call `super.update(newVars, react)` to apply the merge
- Save any "before" values *before* calling `super.update()` if you need to compare
- Default `react=true` triggers a re-render; the server-side flow passes `false`
- Works polymorphically with `ComponentReference.update()` — parent code can call `child.update(...)` regardless of whether the child has been instantiated

---

### `hydrate()`

**When:** After first render, element is in the document  
**Type:** Synchronous  
**Purpose:** One-time post-render setup that requires real DOM

```js
hydrate() {
  // DOM queries — element is attached with correct layout
  const gridEl = this.querySelector('.grid');

  // ResizeObserver, IntersectionObserver, etc.
  this.#resizeObserver = new ResizeObserver((entries) => this.#handleResize(entries));
  this.#resizeObserver.observe(gridEl);

  // Access loaded libraries
  const { Chart } = this.library('ChartLib');
  this.#chart = new Chart(this.querySelector('.chart-container'));
}
```

**Guidelines:**
- Runs once, after the first render — not on re-renders
- Element is in the document with real layout (`offsetWidth`, `getBoundingClientRect` work)
- Safe to use `querySelector`, `ResizeObserver`, third-party widget constructors
- Access libraries loaded in `init()` via `this.library()`
- Don't call `react()` (the framework guards against it)
- Clean up any resources in `destroy()`

---

### `afterRender()`

**When:** After DOM has been rendered/updated  
**Type:** Synchronous  
**Purpose:** Per-render DOM work

```js
afterRender() {
  // Scroll to latest log entry
  const lastLog = this.querySelector('.console-panel-logs').lastElementChild;
  if (lastLog) lastLog.scrollIntoView({ block: 'end', behavior: 'instant' });
}
```

**Guidelines:**
- Safe to access DOM via scoped queries (`this.querySelector()`)
- Called after every render (not just first) — use `hydrate()` for one-time setup
- Keep lightweight to avoid blocking
- Remember to clean up in `destroy()`
- Don't call `react()` (the framework guards against it)

---

### `destroy()`

**When:** Component is removed from DOM  
**Type:** Synchronous  
**Purpose:** Clean up resources

```js
destroy() {
  // Remove event listeners
  if (this.tooltip) {
    this.tooltip.destroy();
  }
  
  // Cancel pending requests
  if (this.abortController) {
    this.abortController.abort();
  }
  
  // Clear timers
  clearInterval(this.intervalId);
}
```

**Guidelines:**
- Remove event listeners
- Cancel pending async operations
- Destroy child resources
- Clear timers/intervals
- Called automatically by framework when component removed
- Event subscriptions (`on()` handlers) are cleared automatically after `destroy()` runs — no manual cleanup needed

---

## Lifecycle Sequence

### First Render

```
1. new Component(vars)
2. init()                    # Async — create children, load libraries, fetch data
   - Children start loading in parallel (detached)
3. [render DOM]
   - Attach pre-created children into mount points
4. [resolve libraries]       # Await library loads started in init()
5. hydrate()                 # One-time — element is in the document
6. afterRender()
```

### Update (vars change)

```
1. update(newVars) merges vars
2. [re-render DOM]
3. afterRender()
```

Note: `hydrate()` is NOT called on updates — only on first render.

### Destroy

```
1. destroy()
2. [remove from registry]
3. [remove from DOM]
```

## Common Patterns

### Fetch Data on Creation

```js
class UserList extends Component {
  async init() {
    if (!this.users) {
      // Only fetch if not already provided
      const response = await fetch('/api/users');
      this.users = await response.json();
    }
  }
}
```

### React to Specific Var Changes

```js
class SearchBox extends Component {
  update(newVars, react = true) {
    const oldQuery = this.query;
    super.update(newVars, react);
    if (oldQuery !== this.query) {
      this.debounceSearch();
    }
  }
  
  debounceSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.performSearch();
    }, 300);
  }
  
  destroy() {
    clearTimeout(this.searchTimer);
  }
}
```

### Initialize DOM-Dependent Libraries

```js
class Chart extends Component {
  async init() {
    this.loadLibrary('ChartLib', 'ChartLibrary');
  }

  hydrate() {
    const { ChartLibrary } = this.library('ChartLib');
    const canvas = this.querySelector('canvas');
    this.#chart = new ChartLibrary(canvas, { data: this.data });
  }

  destroy() {
    if (this.#chart) {
      this.#chart.destroy();
    }
  }
}
```

### Avoid Infinite Loops

The framework includes a **lifecycle guard** that monitors calls to `react()` and `emit()` during `init()`, `update()`, `hydrate()`, or `afterRender()`.

**`react()` inside a lifecycle hook** is **silently ignored** — these hooks already run inside the render pipeline, which re-renders the component after the hook returns. A warning is logged:

```
react() called during init() — ignored (the framework renders automatically after lifecycle hooks)
```

**`emit()` inside a lifecycle hook** still fires but logs a warning, because parent listeners may not be wired yet (buffered `.on()` calls are replayed after the child's lifecycle completes). The emit proceeds in case some listener is already registered, but the warning signals a likely ordering problem:

```
emit('ready') called during init() — listeners may not be registered yet
```

```js
class BadExample extends Component {
  update(newVars, react = true) {
    super.update(newVars, react);
    // This react() call is ignored by the lifecycle guard:
    this.react();
  }
}

class GoodExample extends Component {
  update(newVars, react = true) {
    const oldInput = this.input;
    super.update(newVars, react);
    // Only derive state if the relevant var changed
    if (oldInput !== this.input) {
      this.output = this.calculateOutput(this.input);
    }
  }
}
```

Calling `react()` is appropriate from **event handlers**, **timers**, and **async callbacks** — contexts outside the lifecycle pipeline.

## Best Practices

### ✅ Do

- Keep `update()` synchronous and fast
- Always call `super.update(newVars, react)` in overrides
- Clean up resources in `destroy()`
- Use `hydrate()` for one-time post-render DOM setup (ResizeObserver, third-party widgets)
- Use `afterRender()` for per-render DOM work (scrolling, measuring)
- Use `init()` for async initialization, child creation, and library loading
- Subscribe to child events with `.on()` right after `createChild()` in `init()`
- Compare specific vars in `update()` rather than reacting to all changes

### ❌ Don't

- Don't call `react()` inside `init()`, `update()`, `hydrate()`, or `afterRender()` (the framework guards against this and logs a warning — the render already happens automatically)
- Don't call `emit()` inside lifecycle hooks — parent listeners may not be wired yet (a warning is logged if you do)
- Don't access DOM in `constructor` or `init()` (element may be detached — use `hydrate()`)
- Don't forget to clean up in `destroy()`
- Don't perform expensive sync operations in `update()`
- Don't use `afterRender()` for one-time setup — use `hydrate()` instead

## Debugging Lifecycle Issues

Add logging to understand the lifecycle:

```js
class DebugComponent extends Component {
  constructor(vars) {
    super(vars);
    console.log('[constructor]', this.componentName, this.componentId, vars);
  }
  
  async init() {
    console.log('[init] start', this.componentName, this.componentId);
    await super.init();
    console.log('[init] end', this.componentName, this.componentId);
  }
  
  update(newVars, react = true) {
    console.log('[update]', { newVars });
    super.update(newVars, react);
  }
  
  afterRender() {
    console.log('[afterRender]', this.componentContainer);
  }
  
  destroy() {
    console.log('[destroy]', `${this.componentName}#${this.componentId}`);
  }
}
```
