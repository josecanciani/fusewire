---
name: fusewire-component
description: >
  How to write well-designed FuseWire client-side components for this project.
  Use this skill whenever the user asks to create, design, or review a FuseWire
  component — even if they just say "add a component", "write the JS for X", or
  "how should I structure Y". Covers file layout, vars vs private state,
  component decomposition, lifecycle hooks, and type hinting for child components.
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
    /** @type {string|number} */
    badge = '';
}
```

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

**`async init()`** — runs once after the framework is wired up (you have access
to `this.console`, `this.createChild()`, etc.) and before the first render. Use
it for setup: creating child references, attaching services, initialising
private state.

**`afterRender()`** — runs synchronously after every render (initial and
re-renders). Use it for DOM-dependent work: scrolling, mounting third-party
widgets, subscribing to child events. Must stay synchronous.

**`destroy()`** — cleanup when the component is removed.

Never call `this.react()` inside `init()` or `afterRender()` — the framework
renders automatically after those hooks return.

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

Do not reach into the DOM directly to update UI — change the data, let the
template handle the rest.

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

To interact with a child after it's mounted, use `afterRender()` (by then the
framework has replaced the reference with the real instance):

```javascript
afterRender() {
    if (!this.#ready) {
        this.#ready = true;
        this.sidebar.on('selectItem', (id) => this.select(id));
    }
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

Typical usage in `afterRender()`:

```javascript
afterRender() {
    if (!this.#ready) {
        this.#ready = true;
        const logsEl = this.querySelector('.logs');
        // logsEl is guaranteed to be from THIS component, not a child
        logsEl.scrollTop = logsEl.scrollHeight;
    }
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
