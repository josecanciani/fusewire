---
name: Writing FuseWire Components
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

**Autocalculated variables** are derived state defined via class getters. To make a getter available to the template, **it must be prefixed with `$`**. The framework auto-evaluates these `$` getters during render, eliminating the need to manually sync derived state in `update()` or `init()`.

FuseWire supports calculated vars (JS getters starting with `$`) which allow you to work declaratively in the JS class, defining state-derived truths, and avoiding duplicating these sources of truth in the HTML templates with complex conditional operators.

```javascript
export class Line extends Component {
    count = 5;

    /** @type {boolean} */
    get $isLimitReached() {
        return this.count >= 10;
    }
}
```
In the template, reference it directly without `()`: `<div fw-if="$isLimitReached">`
Note: Avoid expensive computations in `$` getters, as they run on every render.

**Private state** uses native `#private` class fields — these are internal
counters, caches, DOM references, etc. They never appear in the template and the
framework ignores them. Declare them in the class body with a default value:

```javascript
export class Panel extends Component {
    /** @type {Array.<Component|Child>} */
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

### No CSS class names in JavaScript

**Manipular el DOM de manera imperativa rompe todo el paradigma declarativo de FuseWire (y reactividad en general). El estado de JavaScript debe ser la única fuente de la verdad, y el framework debe encargarse de plasmarlo en el HTML.**

So, don't dynamically modify classes directly in the DOM. **The biggest reason for this is that any subsequent reaction will trigger an HTML re-render, and your manual DOM modifications will be completely wiped out because they are not defined in the component's state.** Instead, you need to call methods that update state in JavaScript, and that in turn makes the HTML reload (via `this.react()`).

JS files must **never** contain CSS class names or visual styling strings. Vars
and loop items should expose **semantic data** (booleans, enums, counts) and let
the HTML template decide which CSS classes to apply.

```javascript
// WRONG: Imperative DOM manipulation or JS deciding styling
this.componentContainer.querySelector('.dot').classList.add('bg-primary');

#buildDots() {
    this.dots = this.images.map((_, i) => ({
        cssClass: i === this.activeIndex ? 'bg-primary' : 'bg-secondary opacity-50',
        index: i,
    }));
}
```

```javascript
// RIGHT: JS exposes semantic state declaratively
#buildDots() {
    this.dots = this.images.map((_, i) => ({
        isActive: i === this.activeIndex,
        index: i,
    }));
}
```

The template uses `fw-if` to branch styling based on the semantic value:

```html
<div fw-each="dot in dots">
    <div fw-if="dot.isActive" class="dot dot-active"></div>
    <div fw-if="!dot.isActive" class="dot dot-inactive cursor-pointer"
         onclick="((this)).goTo(((dot.index)))"></div>
</div>
```

This keeps the separation clean: **JS owns data, HTML owns structure and class
assignment, CSS owns visual presentation.**

---

## Lifecycle hooks

The framework runs these hooks in order during component creation:

```
init()  →  render()  →  hydrate()  →  afterRender()
```

**`async init(previousState = null)`** — runs once after the framework is wired up (you have access
to `this.console`, `this.createChild()`, `this.loadLibrary()`, etc.) and before
the first render. Use it for:
- Creating child references (`createChild`)
- Restoring private state passed via `previousState` (saved by `destroy()`)
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

**`destroy()`** — cleanup when the component is removed. You may return a serializable object here (e.g. `return { scroll: this.#scroll };`). The framework will intercept this return value and inject it into the next component instance's `init(previousState)` if it is ever recreated later.

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
`Child` — a lightweight placeholder the framework replaces with
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

### Modals, overlays, and portals

`createChild()` nests the child DOM physically inside the parent's subtree.
This means child components inherit the parent's CSS stacking context. A modal
or overlay spawned deep inside a list component (e.g., inside a `ProductCard`)
will be trapped under the parent's `z-index` and cannot overlay the full page
as intended.

Use `createPortalChild()` to render a child in the **default PortalHost**
(at the top of the DOM hierarchy) while keeping the logical parent-child
relationship for events, lifecycle, and cleanup:

```javascript
async init() {
    // The modal renders at the root DOM level, not inside ProductCard
    this.modal = this.createPortalChild('Cart/Modal', 'main', { items: this.items });

    // Events work normally — the PortalChild forwards them
    this.modal.on('closed', () => this.onModalClosed());
    this.modal.on('checkout', (items) => this.onCheckout(items));
}
```

Portal children do not need `((modal))` in the parent's template — they render
in the PortalHost, not in the parent's DOM. When `ProductCard` is destroyed,
the portal child and its real component in the PortalHost are cleaned up
automatically.

For custom placement, create a PortalHost anywhere in the tree:

```javascript
// In a layout component
this.sidebarPortal = this.createPortalHost('sidebar');

// In any descendant — render into the sidebar portal
this.widget = this.createPortalChild('StatusWidget', 'main', {}, 'sidebar');
```

See [docs/portals.md](../../docs/portals.md) for the full design.


### Subscribing to child events (buffered references)

The `Child` returned by `createChild()` buffers `.on()` calls and
replays them when the real instance mounts. Subscribe directly in `init()`:

```javascript
async init() {
    this.sidebar = this.createChild('Playground/Sidebar', 'sidebar', { demos: [] });
    this.sidebar.on('selectItem', (id) => this.select(id));
    this.sidebar.on('back', () => this.back());
}
```

### Type hinting children

`createChild` and `createLazyChild` return `Component | Child`, but by the time you read a child property it's already the real instance. To get IDE autocomplete and pass type checking (especially when the child class adds new properties like `duration` or `items`), annotate the field with a JSDoc type-only import and cast at the assignment.

> [!TIP]
> Always type child properties (including arrays) with the **specific, final component class** rather than the generic `Component` or `Child`. For your own components, use `import('./Console/Line.js').Line`. For framework-provided wrappers, use `import('/js/component.js').ErrorBoundary` or `import('/js/component.js').Lazy`. This ensures correct type checking for child-specific features and provides full IDE autocomplete.

> [!IMPORTANT]
> **Parentheses are mandatory** for the cast. If you omit them, `tsc` will fail with error `TS2322: Type 'Component | Child' is not assignable to type 'MyComponent'`, because the cast is not correctly applied to the entire expression.

```javascript
/** @type {import('./Console/Line.js').Line} */
lineChild = null;

async init() {
    // Parentheses around the call are required!
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

The `import()` in JSDoc is purely a type annotation — no module is loaded at runtime.

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
blocking the parent's render. It requires two child declarations: the lazy component and its placeholder:

```javascript
async init() {
    this.chart = this.createLazyChild(
        this.createChild('Analytics/HeavyChart', 'chart'),
        this.createChild('Common/Skeleton', 'chart') // mandatory placeholder
    );

    // You can interact with the child once it's fully created and hydrated
    this.chart.on('fw-ready', (instance) => {
        this.console.log('Heavy chart is visible and fully mounted!', instance);
    });
}
```

The parent renders immediately with the placeholder. When the real child's JS and
template load, the framework swaps the placeholder for the real component and
fires `fw-ready` on the fully hydrated component instance. Works
consistently in both CSR and SSR.

---

## Error handling and fallbacks

When a component fails to initialize or its template fails to load, the error bubbles up the component tree. You can handle this gracefully in two ways:

### 1. Fallback components (Declarative)

Provide a `fallback` option when creating a child. If the child fails, the framework renders the fallback in its place, passing `errorMessage` and `failedComponent` as vars. The parent continues rendering normally.

```javascript
// Eager child with fallback
this.chart = this.createChild('Analytics/Chart', 'main', {}, {
    fallback: 'Common/ErrorCard'
});

// Lazy child with fallback (configured on the lazy child reference)
this.lazyChart = this.createLazyChild(
    this.createChild('Analytics/HeavyChart', '', {}, null, { fallback: 'Common/ErrorCard' }),
    this.createChild('Common/Skeleton')
);
```

### 2. The `fw-error` event (Programmatic)

The framework emits an `fw-error` event on the child reference when creation fails. If a listener returns `false`, propagation stops and the parent survives (the mount point remains empty).

```javascript
async init() {
    this.chart = this.createChild('Analytics/Chart');

    this.chart.on('fw-error', (errorContext) => {
        this.console.error('Chart failed:', errorContext.error);
        // Stop propagation so the parent doesn't crash
        return false;
    });
}
```

If no fallback is configured and no listener stops propagation, the error bubbles up, crashing the parent, and continuing until handled or it reaches the root.

---

## Styling child components (CSS Penetration)

Because FuseWire automatically scopes CSS to prevent collisions, targeting a child component from a parent's CSS file requires special care.

When a parent component renders a child, the corresponding `<fw-mount>` DOM node receives a class matching the child component's name (e.g., `.Console_Line`). However, the mount point itself is rendered with `display: contents`, meaning it does not generate a physical box in the browser.

If you attempt to apply visual styles like `background-color`, `padding`, or `border` directly to the child's root class from the parent's CSS, the style will be successfully applied but visually ignored by the browser.

To properly apply layout styles to a child component from the parent (for example, applying zebra-striping to a list of children), you must penetrate the scoping boundary by targeting the *rendered container* inside the child component, not just the mount point.

```css
/* ❌ WRONG: Targets the invisible mount point, background will not render */
.console-panel-logs .Console_Line:nth-child(even) {
    background-color: #eee;
}

/* ✅ RIGHT: Targets the mount point, then targets the visible box inside it */
.console-panel-logs .Console_Line:nth-child(even) .console-line {
    background-color: #eee;
}
```

> [!WARNING]
> Do not use the direct child combinator (`>`) if the child components are rendered via `<fw-each>`. The loop directive is rendered as an actual `<fw-each>` node in the DOM tree, introducing an intermediate wrapper between your list container and the children that breaks `>`. Use the standard descendant selector (a space) instead.

---

## Dynamic CSS classes

When a template builds class names via variable interpolation, the CSS file must
declare which classes are generated at runtime. Without this, the
`css-class-consistency` check flags them as unused.

Add a `fw-dynamic-classes` comment at the top of the component's `.css` file
listing every class that will be produced by interpolation:

```css
/* fw-dynamic-classes: log-warn, log-error, log-debug */

.console-line { padding: 1px 0.5rem; }
.log-warn { color: #e5c07b; }
.log-error { color: #e06c75; }
.log-debug { color: #61afef; }
```

```html
<div class="log-((level)) console-line">((message))</div>
```

When `level` is `'warn'`, the rendered output is
`<div class="log-warn console-line">`. The annotation exempts `log-warn`,
`log-error`, and `log-debug` from the "CSS class not used in HTML" rule.

Plan for this annotation when designing class names that depend on component
vars. If the `css-class-consistency` check flags other class mismatches
(external framework classes, child component scoping, etc.), follow the fix
instructions in the check output — it tells you exactly what annotation or
change to apply.

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

## Debugging: this.console vs window.console

`this.console` is the framework's in-app logger — it routes output to the
Console component visible in the UI. In test environments and when no Console
component is mounted, `this.console` output is silently discarded.

When debugging component behavior, use `window.console.log()` (or
`window.console.error()`, etc.) to ensure output always reaches the terminal
or browser devtools regardless of whether a Console component is mounted.

---

## Component decomposition

A component should have one clear responsibility. When something starts feeling
like it has two concerns, it probably needs to be two components. Reusability
is another signal — if the same UI pattern appears in multiple places, extract
it into a shared component (e.g., `Common/Carousel`).

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

---

## Quality checks (required after component changes)

After creating or modifying a component (JS, HTML, or CSS), **always run the
quality checks** before considering your work done.

The check runner lives at `checks/run.js` inside the `@fusewire/client` package:

| Installation method | Runner path |
|---|---|
| npm dependency | `node_modules/@fusewire/client/checks/run.js` |
| Git submodule | `<submodule-path>/checks/run.js` (e.g. `lib/fusewire/checks/run.js`) |

**After creating or modifying a component, prefer the single-component form:**

```bash
node <runner-path> <componentDir> <componentName>
```

The runner reads project configuration from `.fusewire.json` in the working
directory. Violation messages include specific fix instructions — follow them
directly. Fix all violations before presenting your changes to the user.
