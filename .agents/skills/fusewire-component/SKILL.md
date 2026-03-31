---
name: fusewire-component
description: >
  How to write well-designed FuseWire client-side components for this project.
  Use this skill whenever the user asks to create, design, or review a FuseWire
  component — even if they just say "add a component", "write the JS for X", or
  "how should I structure Y". Covers file layout, vars vs private state,
  component decomposition, lifecycle hooks, libraries, and type hinting for
  child components.
---

# Writing FuseWire Components

## File layout

Every component is three colocated files:

```
MyComponent.js    ← the class
MyComponent.html  ← the template
MyComponent.css   ← scoped styles (optional)
```

The class name matches the filename and the last path segment. A component at
`Console/Panel.js` exports `class Panel`. The framework resolves names this way
when `createChild('Console/Panel', ...)` is called.

```javascript
import { Component } from '/js/component.js';

export class Counter extends Component {
    // ...
}
```

---

## Vars vs private state

**Vars** are public class fields — everything the template needs to render.
The framework collects them automatically via `Object.keys()`.

```javascript
export class Line extends Component {
    /** @type {string} */
    level = '';
    /** @type {string} */
    message = '';
    /** @type {number} */
    badge = 0;
}
```

> **Prefer single-typed, non-nullable vars.** Each var should ideally have one
> data type (e.g., always `string`, never `string|number`). Avoid union types
> like `string|null` or `number|undefined` — initialize with sensible defaults
> (`''`, `0`, `[]`) instead. This keeps templates simple (no null checks) and
> makes the component's contract clearer.

**Private state** uses native `#private` class fields — these are internal
counters, caches, DOM references, etc. They never appear in the template and the
framework ignores them. Declare them in the class body with a default value:

```javascript
export class Panel extends Component {
    /** @type {Array.<Component|ComponentReference>} */
    logs = [];

    #lastKey = '';
    #lastCount = 0;
    #messageCount = 1; // private counter, not rendered
    #editorView = null; // DOM reference, not rendered
}
```

Private helper methods also use `#`:

```javascript
#addLog(level, message) {
    this.#messageCount++;
    // ...
}
```

The rule of thumb: if the template needs to know about it, it's a var. If it's
bookkeeping for the component's own logic, it's private.

---

## Lifecycle hooks

The framework runs these hooks in order during component creation:

```
init()  →  render()  →  hydrate()  →  afterRender()
```

**`async init()`** — runs once after the framework is wired up (you have access
to `this.console`, `this.createChild()`, `this.loadLibrary()`, etc.) and before
the first render. Use it for:
- Creating child references (`createChild`)
- Loading libraries (`loadLibrary`)
- Subscribing to child events (buffered on the reference)
- Setting initial state

**`hydrate()`** — runs once after the first render. The DOM exists,
all children are mounted, and all libraries are loaded. Use it for one-time
post-render setup:
- DOM work: `querySelector`, `ResizeObserver`, focus management
- Library instantiation: `this.library()` to access loaded modules
- Third-party widget mounting (CodeMirror, Highcharts, etc.)

```javascript
hydrate() {
    const gridEl = this.querySelector('.grid');
    this.#resizeObserver = new ResizeObserver((entries) => this.#handleResize(entries));
    this.#resizeObserver.observe(gridEl);
}
```

**`afterRender()`** — runs synchronously after every render (initial and
re-renders). Use it only for per-render DOM work: scrolling, measuring, updating
third-party widgets. Must stay synchronous.

**`destroy()`** — cleanup when the component is removed.

Never call `this.react()` inside `init()`, `hydrate()`, or `afterRender()` — the
framework renders automatically after those hooks return.

---

## Calling react()

Call `this.react()` when you want the framework to diff and re-render. Mutating
vars without calling `react()` is valid — use it to batch multiple changes before
a single render, or to defer rendering until later.

```javascript
increment() {
    this.count++;
    this.react(); // re-render now
}

// batch: only one render at the end
loadData(items) {
    this.loading = false;
    this.items = items;
    this.total = items.length;
    this.react();
}
```

`react()` is always safe to call from event handlers, timers, and async
callbacks. The framework batches re-renders via the reactor queue. Do not reach
into the DOM directly to update UI — change the data, let the template handle
the rest.

---

## Child components

Declare children with `createChild(name, id, vars)`. This returns a
`ComponentReference` — a lightweight placeholder the framework replaces with
the real instance once the parent renders and the child mounts.

```javascript
async init() {
    this.logs.push(
        this.createChild('Console/Line', String(this.#messageCount), {
            level: 'log', message: 'Console ready', badge: 0, source: '', timestamp: '',
        }),
    );
}
```

The template places the child via `((logs))` (or the specific var name). The
engine auto-mounts it — no manual wiring needed.

### Subscribing to child events (buffered references)

The `ComponentReference` returned by `createChild()` buffers `.on()` calls and
replays them when the real instance mounts. Subscribe directly in `init()`:

```javascript
async init() {
    this.sidebar = this.createChild('Playground/Sidebar', 'sidebar', { demos: [] });
    this.sidebar.on('selectItem', (id) => this.select(id));
    this.sidebar.on('back', () => this.back());
}
```

### Type hinting children

`createChild` returns `ComponentReference`, but by the time you read a child
property it's already the real instance. To get IDE autocomplete on child-specific
vars and methods, annotate the field with a JSDoc type-only import (zero runtime
cost) and cast at the assignment:

```javascript
/** @type {import('./Console/Line.js').Line} */
lineChild = null;

async init() {
    this.lineChild = /** @type {import('./Console/Line.js').Line} */ (
        this.createChild('Console/Line', '1', { message: 'hello' })
    );
}
```

For arrays of the same child type:

```javascript
/** @type {Array.<import('./Console/Line.js').Line>} */
logs = [];
```

The `import()` in JSDoc is purely a type annotation — no module is loaded at
runtime.

---

## Loading libraries

Use `loadLibrary()` in `init()` to load a JS module through the framework's
loader. It is non-blocking — the framework loads the file in parallel with child
component templates. Access the loaded module in `hydrate()` via
`this.library()`, which returns the full module object (like dynamic `import()`):

```javascript
async init() {
    this.loadLibrary('GameOfLife/Engine');
    this.controls = this.createChild('GameOfLife/Controls', 'controls', {});
}

hydrate() {
    const { Engine, createEmptyGrid } = this.library('GameOfLife/Engine');
    this.#engine = new Engine();
}
```

Library files live alongside component files (e.g.,
`components/GameOfLife/Engine.js`) and are versioned through the same template
store mechanism.

If a library exports a stateful class that needs pub/sub, extend `Library`:

```javascript
import { Library } from '/js/library.js';

export class Engine extends Library {
    // Gets on(), emit(), init(), destroy() from Library
    // No react(), no template, no DOM
}

// Also export plain functions from the same file
export function createEmptyGrid(rows, cols) { ... }
```

---

## Child-to-parent events (pub/sub)

Children communicate with parents by emitting events. The parent subscribes —
either in `init()` (on the reference, buffered until mount) or in `hydrate()`
(on the live instance). The child never holds a reference to the parent.

**Child emits:**

```javascript
back() {
    this.emit('back');
}

selectItem(id) {
    this.emit('selectItem', id);
}
```

**Parent subscribes in `init()`** (preferred — buffered on the reference):

```javascript
async init() {
    this.sidebar = this.createChild('Playground/Sidebar', 'sidebar', { demos: [] });
    this.sidebar.on('selectItem', (id) => this.select(id));
    this.sidebar.on('back', () => this.back());
}
```

`on()` returns an unsubscribe function. Subscriptions are cleared automatically
when the child is destroyed — no manual cleanup needed.

Do not call `emit()` inside `init()`, `hydrate()`, or `afterRender()` — parent
listeners may not be registered yet and a warning will be logged.

---

## Top-down events (broadcast)

Broadcast pushes an event down through the component tree. Handlers receive the
event arguments and can return `false` to stop propagation into their subtree
(siblings are unaffected).

### Global broadcast (reactor → all components)

Use `reactor.broadcast()` for app-wide signals like theming or locale changes.
Reactor-level listeners fire first, then the event walks every root and its
subtree.

```javascript
// In the root component — relay a child event as a global broadcast
this.header.on('changeTheme', (theme) => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    this[REACTOR].broadcast('theme', theme);
});
```

### Scoped broadcast (component → subtree)

Use `this.broadcast()` inside a component to send an event only to its own
subtree.

```javascript
// Only reaches this component and its descendants
this.broadcast('reset', defaultValues);
```

### Listening for broadcasts

Any component can listen with `this.on()` — the same method used for pub/sub.
Broadcast events are delivered through the component's event emitter.

```javascript
async init() {
    this.on('theme', (theme) => this.#applyTheme(theme));
}
```

### Theming pattern

A complete example: a Header component toggles the theme, the root component
relays it as a global broadcast, and any component that needs custom behavior
(e.g., swapping a CodeMirror theme) listens for it.

```javascript
// Header.js — emits the user's choice
toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    this.react();
    this.emit('changeTheme', this.theme);
}

// Home.js (root) — sets the Bootstrap attribute and broadcasts
this.header.on('changeTheme', (theme) => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    this[REACTOR].broadcast('theme', theme);
});

// Editor.js — listens and swaps CodeMirror theme
async init() {
    this.on('theme', (theme) => this.#applyTheme(theme));
}
```

Most components don't need to listen — Bootstrap CSS variables adapt
automatically when `data-bs-theme` changes. Only listen when you need
programmatic behavior (e.g., reconfiguring a third-party widget).

---

## Lazy child components

Use `createLazyChild()` for children that should load in the background without
blocking the parent's render:

```javascript
async init() {
    this.chart = this.createLazyChild('Analytics/HeavyChart', 'chart', {
        placeholder: 'Common/Skeleton',  // optional — defaults to built-in placeholder
    });
}
```

The parent renders immediately with a placeholder. When the real child's JS and
template load, the framework swaps the placeholder for the real component. Works
consistently in both CSR and SSR.

---

## Scoped DOM queries

When a component needs direct DOM access (scrolling, measuring, third-party
widget init), use the scoped query methods instead of
`this.componentContainer.querySelector()`. They exclude child component
subtrees automatically, so you only match elements from the current template.

```javascript
// WRONG: may reach into child component DOM
this.componentContainer.querySelector('.console-panel-logs');

// RIGHT: scoped to this component's own rendered DOM
this.querySelector('.console-panel-logs');
```

| Method | Returns | Description |
|---|---|---|
| `this.querySelector(selector)` | `Element\|null` | First match in own DOM |
| `this.querySelectorAll(selector)` | `Array.<Element>` | All matches in own DOM |
| `this.getElementsByClassName(names)` | `Array.<Element>` | Match by space-separated class names |

Under the hood these append a `:not([data-fusewire-parent-id="..."] *)`
exclusion so the browser's selector engine skips child mount points natively.
Comma-separated selectors are supported.

Use `hydrate()` for one-time DOM setup and `afterRender()` for per-render work:

```javascript
hydrate() {
    const gridEl = this.querySelector('.grid');
    this.#resizeObserver = new ResizeObserver((entries) => this.#handleResize(entries));
    this.#resizeObserver.observe(gridEl);
}
```

Per-render DOM work (runs after every render):

```javascript
afterRender() {
    const lastLog = this.querySelector('.console-panel-logs').lastElementChild;
    if (lastLog) lastLog.scrollIntoView({ block: 'end', behavior: 'instant' });
}
```

---

## Component decomposition

A component should have one clear responsibility. When something starts feeling
like it has two concerns, it probably needs to be two components.

**The clearest signal to split:** a list where each item has its own rendering
logic or non-trivial state. The parent manages the list; a child component
renders one item.

### Console example

`Console/Panel` manages the log list — deduplication, scroll-to-bottom,
the message counter. It never knows how a single line looks.

`Console/Line` knows only how to render one log entry (level, message, badge,
source, timestamp). It has no logic at all — just vars and a template.

```
Console/
  Panel.js   ← orchestrates: manages list, counter, deduplication, scroll
  Panel.html
  Line.js    ← renders: one log entry, pure data → UI
  Line.html
```

This split pays off when:
- The item template grows (more formatting, conditional classes)
- You need `update()` on individual items without re-rendering the whole list
  (Panel calls `this.logs.at(-1).update({ badge: count })` directly)
- The item gains its own behavior (click to expand, copy button, etc.)

Conversely, if each item is literally one `<li>` with a string inside, a
`fw-each` loop in the parent template is simpler and doesn't need its own
component.

### Splitting guidelines

| Keep together | Split out |
|---|---|
| Simple list of scalar values | List where each item has its own template/logic |
| One clearly scoped responsibility | Two concerns starting to share a file |
| Template stays short and readable | Template growing to handle many sub-cases |

When in doubt, start together and split when the component starts feeling crowded.

---

## JSDoc on all public methods and fields

All public class fields need `@type`. All methods need full JSDoc with `@param`
and `@returns` (if they return something). Private `#` fields and methods are exempt.

```javascript
export class Counter extends Component {
    /** @type {number} */
    count = 0;

    /**
     * Increment the counter by one and re-render
     */
    increment() {
        this.count++;
        this.react();
    }
}
```
