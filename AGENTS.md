# FuseWire Client Library - Development Guide

## Tech Stack

- **Runtime:** Browser ES modules (tested in Node.js >= 18.0.0)
- **Testing:** Node.js test runner + Playwright for browser tests
- **Linter:** oxlint
- **Formatter:** oxfmt

## Project Structure

```
lib/fusewire/
  src/                      # Source files (browser ES modules)
    component.js
    component-id.js
    event-emitter.js
    instance.js
    reactor.js
    renderer.js
    template-compiler.js
    template-store.js
    config.js
    errors/
    utils/
  test/                     # Node.js tests (JSDOM)
    *.test.js
    browser/                # Playwright browser tests
      morphing.spec.js
      morphing-test.html
      vendor/               # Local copies of dependencies
  package.json
```

## Scripts

| Command                 | Description                        |
|-------------------------|------------------------------------|
| `npm test`              | Run Node tests (fast)              |
| `npm run test:browser`  | Run Playwright browser tests       |
| `npm run test:all`      | Run both Node and browser tests    |
| `npm run lint`          | Lint source files with oxlint      |
| `npm run format`        | Format source files with oxfmt     |
| `npm run format:check`  | Check formatting without writing   |
| `npm run jsdoc-check`   | Validate JSDoc documentation       |
| `npm run typecheck`     | Type-check JS files with TypeScript |

## Testing Strategy

### 1. Node Tests (Fast - Run Always)
```bash
npm test
```
- **380 tests:** 367 passing, 13 skipped (JSDOM/idiomorph incompatibility)
- Runs in Node.js using JSDOM for DOM emulation
- **Use for:** Development, CI, quick validation
- **Limitation:** Cannot test DOM morphing (idiomorph requires real browser)

### 2. Browser Tests (Slow - Run Selectively)
```bash
npm run test:browser
```
- **4 tests:** Validates DOM morphing in real browser (Chromium via Playwright)
- **Run when:**
  - Making changes to morphing logic (renderer.js, instance.js update flow)
  - Before committing to ensure morphing works correctly
  - Testing browser-specific behavior
- **Skip when:** Working on non-morphing code (component.js, template-compiler.js, etc.)

### Run Both
```bash
npm run test:all
```
- Runs Node tests followed by browser tests
- **Total:** 371 tests passing (367 Node + 4 Browser)

**Note:** The 7 skipped Node tests are covered by the 4 browser tests. They're skipped because JSDOM doesn't fully emulate the `Document` constructor that idiomorph checks during morphing operations.

## Verification

Before considering a change complete, run:

```bash
npm run lint && npm run format:check && npm run jsdoc-check && npm run typecheck && npm test
```

Before committing or when changing morphing logic:

```bash
npm run lint && npm run format:check && npm run jsdoc-check && npm run typecheck && npm run test:all
```

## Constraints

- **Browser-compatible JavaScript only.** Use ES2020+ features that work in modern browsers.
- **ES modules only.** All files use `import`/`export`. No CommonJS.
- **No setters.** Avoid setter methods and `set` accessors. Prefer passing state at construction time (via constructor/config). Follow a functional pattern — objects should be configured once, not mutated after creation. Internal framework wiring (e.g., setting Symbol-keyed state on instances) is acceptable.

## Code Style

- **Indentation:** 4 spaces (not tabs)
- **Quotes:** Single quotes for strings
- **No hardcoded duplicates:** Never repeat a value that is already stored in a variable or derived from code. If a path, name, or label appears in log messages, error messages, or comments, reference the variable — don't hardcode the string a second time.
- **No defensive fallbacks:** Do not use optional chaining (`?.`), ternary fallbacks (`x ? x.prop : ''`), `|| defaultValue`, or silent early returns to mask values that should always be present. If state is required, access it directly and let the error surface. Defensive fallbacks hide bugs. Legitimate uses: public lookup methods returning null for missing keys, optional function parameters with defaults, and API boundaries where input is untrusted.
- Enforced via oxfmt configuration and automated tests

## JSDoc Documentation

All functions must have JSDoc comments with:

- **Description:** What the function does
- **@param:** All parameters with specific types (no generic `{Object}` or `{Function}`)
  - Use `{ComponentId}`, `{Component}`, `{Reactor}`, etc. for custom types
  - Use `{HTMLElement}`, `{Element}`, `{string}`, `{number}`, `{boolean}` for standard types
  - Use `{object}` (lowercase) for plain objects, `{Array.<Type>}` for typed arrays
  - Always include parameter descriptions
- **@returns:** Return type and description (if function returns a value)

Enforced via ESLint with `eslint-plugin-jsdoc`. Run `npm run jsdoc-check` to validate.

Example:
```javascript
/**
 * Get an existing instance by component code string
 * @param {string} code - Component code (e.g., "Counter#main")
 * @returns {Component|null} The component instance or null if not found
 */
getByCode(code) {
  // ...
}
```

## Conventions

- Source files live under `src/`.
- Tests live under `test/` using the `*.test.js` suffix.
- Browser tests live under `test/browser/` using the `*.spec.js` suffix (Playwright convention).
- Browser tests import dependencies from `/node_modules/` directly (served by http-server).

## Template Syntax

- **Variable interpolation:** `((variableName))` not `{{variableName}}`
- **Conditionals:** `fw-if="condition"`
- **Loops:** `fw-each="item in items"`
- **Component references:** `((this))` in event handlers

## Component Patterns

### Data drives the UI

The core principle of FuseWire is: **you manage data, the template manages the UI**. Never manually add/remove DOM elements, toggle visibility, or manage UI state in JS. Instead, set vars and call `this.react()`. The template decides what to render based on those vars.

```javascript
// WRONG: manually toggling UI
this.componentContainer.querySelector('.details').style.display = 'block';

// RIGHT: set a property, let the template handle it
this.showDetails = true;
this.react();
```

### fw-if and fw-each: nesting support

The template compiler handles nested same-tag elements correctly. You can freely nest `<div>` inside a `<div fw-if="...">`, use `<li fw-each>` inside another `<li fw-each>`, etc. The parser tracks tag depth to find the correct closing tag.

### Child components via properties

To include a child component, assign its instance to a property. The template renders it as a mount point via `((varName))`. The engine auto-mounts child components: after rendering the parent, it finds mount points and creates/renders the child instances automatically. No manual `reactor.start()` or `afterRender()` is needed for child components.

### Introspection over re-fetching

After a component has been rendered (template lazy-loaded), read its source from the template store instead of fetching files again:

```javascript
// Template is auto-loaded on first render; read it from the store afterward
import { REACTOR } from './symbols.js';
const template = this[REACTOR]._templateStore.get(name);
// template.htmlCode, template.cssCode are available
```

### Child-to-parent communication (pub/sub)

Children emit events; parents subscribe. This keeps children decoupled from their parent — a child never holds a reference to the parent.

**Child emits** from its own methods in response to user interaction:

```javascript
back() {
    this.emit('back');
}
selectDemo(name) {
    this.emit('selectDemo', name);
}
```

**Parent subscribes** in `afterRender()`, once the child instance has been mounted. The framework replaces a `ComponentReference` with the real `Component` instance before `afterRender()` runs, so `child.on()` is always called on the live instance:

```javascript
afterRender() {
    if (!this._ready) {
        this._ready = true;
        this.sidebarComponent.on('back', () => this.back());
        this.sidebarComponent.on('selectDemo', (name) => this.selectDemo(name));
    }
}
```

`on()` returns an unsubscribe function. Subscriptions are cleared automatically when the child is destroyed — no manual cleanup is needed.

Do not call `emit()` inside `init()`, `update()`, or `afterRender()` — parent listeners are not registered yet and a warning will be logged.

### Scoped DOM queries

When you need to read or manipulate the DOM directly (e.g., scrolling, measuring, attaching third-party widgets), use the component's scoped query methods instead of `this.componentContainer.querySelector()`. The scoped versions automatically exclude child component subtrees so you only match elements rendered by the current component's template.

```javascript
// WRONG: may match elements inside child components
this.componentContainer.querySelector('.console-panel-logs');

// RIGHT: restricted to this component's own DOM
this.querySelector('.console-panel-logs');
```

Available methods:

| Method | Returns | Description |
|---|---|---|
| `this.querySelector(selector)` | `Element\|null` | First match in own DOM |
| `this.querySelectorAll(selector)` | `Array.<Element>` | All matches in own DOM |
| `this.getElementsByClassName(names)` | `Array.<Element>` | Match by space-separated class names |

These methods append a `:not()` exclusion to the CSS selector so the browser never enters child mount points. Comma-separated selectors are supported.

### afterRender() for post-render DOM work

`afterRender()` is called after the component's DOM has been rendered. Use it for work that needs the DOM to exist, such as attaching third-party widgets (e.g., Highcharts, CodeMirror) that require an existing DOM element for initialization. Use a guard flag to run one-time setup only once. Note: child component mounting is handled automatically by the engine -- `afterRender()` is NOT needed for that.

## Common Issues

### "cssCode is undefined" errors
- Use `compiledTemplate.css` (getter), not `compiledTemplate.cssCode` (property)
- The template compiler returns a getter, not a plain property

### JSDOM morphing failures
- Expected - idiomorph requires real browser for DOM morphing
- Skip these tests with `it.skip()` and add note pointing to browser tests
- Verify with Playwright browser tests instead
