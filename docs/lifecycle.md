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

### `async hydrate()`

**When:** After vars are set/updated, before first render  
**Type:** Async  
**Purpose:** Perform async initialization

```js
async hydrate() {
  // Fetch initial data
  const data = await fetch('/api/data').then(r => r.json());
  this.items = data.items;
  
  // Initialize external libraries
  await this.initChart();
  
  // Set up event listeners (after render)
  // Note: Use afterRender() for DOM-dependent setup
}
```

**Guidelines:**
- Safe for async operations (fetch, timers, etc.)
- Can modify component properties before render
- Called before `update()` on var changes
- Don't access DOM directly (use `afterRender()` instead)

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

### `afterRender()`

**When:** After DOM has been rendered/updated  
**Type:** Synchronous  
**Purpose:** DOM-dependent initialization

```js
afterRender() {
  // Set up event listeners
  const button = this.componentContainer.querySelector('.submit-btn');
  button.addEventListener('click', () => this.submit());
  
  // Initialize DOM-dependent libraries
  this.tooltip = new Tooltip(this.componentContainer.querySelector('.help-icon'));
  
  // Trigger animations
  this.componentContainer.classList.add('fade-in');
}
```

**Guidelines:**
- Safe to access `this.componentContainer` and child elements
- Called after every render (not just first)
- Keep lightweight to avoid blocking
- Remember to clean up in `destroy()`

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
2. hydrate()                    # Async, can modify properties
3. [render DOM]
4. afterRender()
```

### Update (vars change)

```
1. update(newVars) merges vars
2. [re-render DOM]
3. afterRender()
```

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
  async hydrate() {
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
  afterRender() {
    // Clean up previous chart if exists
    if (this.chart) {
      this.chart.destroy();
    }
    
    // Initialize new chart
    const canvas = this.componentContainer.querySelector('canvas');
    this.chart = new ChartLibrary(canvas, {
      data: this.data
    });
  }
  
  destroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}
```

### Avoid Infinite Loops

The framework includes a **lifecycle guard** that monitors calls to `react()` and `emit()` during `hydrate()`, `update()`, or `afterRender()`.

**`react()` inside a lifecycle hook** is **silently ignored** — these hooks already run inside the render pipeline, which re-renders the component after the hook returns. A warning is logged:

```
react() called during hydrate() — ignored (the framework renders automatically after lifecycle hooks)
```

**`emit()` inside a lifecycle hook** still fires but logs a warning, because parent listeners are typically set up in the parent's `afterRender()` which runs after the child's hooks. The emit proceeds in case some listener is already registered, but the warning signals a likely ordering problem:

```
emit('ready') called during hydrate() — listeners may not be registered yet
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
- Use `afterRender()` for DOM manipulation
- Use `hydrate()` for async initialization
- Compare specific vars in `update()` rather than reacting to all changes

### ❌ Don't

- Don't call `react()` inside `hydrate()`, `update()`, or `afterRender()` (the framework guards against this and logs a warning — the render already happens automatically)
- Don't call `emit()` inside lifecycle hooks — parent listeners are not yet registered at that point (a warning is logged if you do)
- Don't access DOM in `constructor` or `hydrate()` (not ready yet)
- Don't forget to clean up in `destroy()`
- Don't perform expensive sync operations in `update()`
- Don't modify DOM directly outside `afterRender()`

## Debugging Lifecycle Issues

Add logging to understand the lifecycle:

```js
class DebugComponent extends Component {
  constructor(vars) {
    super(vars);
    console.log('[constructor]', this.componentName, this.componentId, vars);
  }
  
  async hydrate() {
    console.log('[hydrate] start', this.componentName, this.componentId);
    await super.hydrate();
    console.log('[hydrate] end', this.componentName, this.componentId);
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
