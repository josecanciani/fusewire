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

## Testing Strategy

### 1. Node Tests (Fast - Run Always)
```bash
npm test
```
- **200 tests:** 193 passing, 7 skipped (JSDOM/idiomorph incompatibility)
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
- **Total:** 197 tests passing (193 Node + 4 Browser)

**Note:** The 7 skipped Node tests are covered by the 4 browser tests. They're skipped because JSDOM doesn't fully emulate the `Document` constructor that idiomorph checks during morphing operations.

## Verification

Before considering a change complete, run:

```bash
npm run lint && npm run format:check && npm run jsdoc-check && npm test
```

Before committing or when changing morphing logic:

```bash
npm run lint && npm run format:check && npm run jsdoc-check && npm run test:all
```

## Constraints

- **Browser-compatible JavaScript only.** Use ES2020+ features that work in modern browsers.
- **ES modules only.** All files use `import`/`export`. No CommonJS.

## Code Style

- **Indentation:** 4 spaces (not tabs)
- **Quotes:** Single quotes for strings
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

## Common Issues

### "cssCode is undefined" errors
- Use `compiledTemplate.css` (getter), not `compiledTemplate.cssCode` (property)
- The template compiler returns a getter, not a plain property

### JSDOM morphing failures
- Expected - idiomorph requires real browser for DOM morphing
- Skip these tests with `it.skip()` and add note pointing to browser tests
- Verify with Playwright browser tests instead
