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
  this.vars.items = data.items;
  
  // Initialize external libraries
  await this.initChart();
  
  // Set up event listeners (after render)
  // Note: Use afterRender() for DOM-dependent setup
}
```

**Guidelines:**
- Safe for async operations (fetch, timers, etc.)
- Can modify `this.vars` before render
- Called before `update()` on var changes
- Don't access DOM directly (use `afterRender()` instead)

---

### `update(oldVars)`

**When:** When vars change on an existing instance  
**Type:** Synchronous  
**Purpose:** React to var changes

```js
update(oldVars) {
  if (oldVars.search !== this.vars.search) {
    console.log('Search changed:', oldVars.search, '->', this.vars.search);
    this.performSearch();
  }
  
  if (oldVars.page !== this.vars.page) {
    this.scrollToTop();
  }
}
```

**Guidelines:**
- Called **after** `hydrate()` completes
- Synchronous to avoid race conditions
- Compare `oldVars` with `this.vars` to detect specific changes
- Don't trigger additional `react()` calls here (infinite loop risk)

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

---

## Lifecycle Sequence

### First Render

```
1. new Component(vars)
2. hydrate()                    # Async, can modify vars
3. [render DOM]
4. afterRender()
```

### Update (vars change)

```
1. Update vars
2. hydrate()                    # Async, called again
3. update(oldVars)              # Synchronous, after hydrate
4. [re-render DOM]
5. afterRender()
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
    if (!this.vars.users) {
      // Only fetch if not already provided
      const response = await fetch('/api/users');
      this.vars.users = await response.json();
    }
  }
}
```

### React to Specific Var Changes

```js
class SearchBox extends Component {
  update(oldVars) {
    if (oldVars.query !== this.vars.query) {
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
      data: this.vars.data
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

```js
class BadExample extends Component {
  update(oldVars) {
    // DON'T DO THIS - infinite loop!
    this.react();
  }
}

class GoodExample extends Component {
  update(oldVars) {
    // Only react if you're changing DIFFERENT vars
    if (oldVars.input !== this.vars.input) {
      // This is safe if calculateOutput doesn't trigger another react
      this.vars.output = this.calculateOutput(this.vars.input);
    }
  }
}
```

## Best Practices

### ✅ Do

- Keep `update()` synchronous and fast
- Clean up resources in `destroy()`
- Use `afterRender()` for DOM manipulation
- Use `hydrate()` for async initialization
- Compare specific vars in `update()` rather than reacting to all changes

### ❌ Don't

- Don't call `react()` inside `update()` (infinite loop)
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
    console.log('[hydrate] start', this.vars);
    await super.hydrate();
    console.log('[hydrate] end', this.vars);
  }
  
  update(oldVars) {
    console.log('[update]', { oldVars, newVars: this.vars });
  }
  
  afterRender() {
    console.log('[afterRender]', this.componentContainer);
  }
  
  destroy() {
    console.log('[destroy]', `${this.componentName}#${this.componentId}`);
  }
}
```
