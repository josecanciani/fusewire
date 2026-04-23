# FuseWire Client Library

Client-side component framework for building reactive web applications.

## Features

- Component-based architecture with lifecycle hooks
- Template compilation with `fw-if` and `fw-each` directives
- DOM morphing for efficient updates
- CSS scoping per component
- Nested component composition
- Server integration support (optional)

## Installation

```bash
npm install @fusewire/client
```

## Usage

```js
import { Component } from '@fusewire/client/component.js';
import { Reactor } from '@fusewire/client/reactor.js';

class Counter extends Component {
  increment() {
    this.vars.count++;
    this.react();
  }
}

const reactor = new Reactor('myApp');
reactor.start(
  document.getElementById('app'),
  'Counter',
  'main',
  { count: 0 }
);
```

## Documentation

See the [FuseWire documentation](https://github.com/josecanciani/fusewire-js) for full details.

## Development

```bash
# Run tests (Node.js with JSDOM)
npm test

# Run browser tests (Playwright)
npm run test:browser

# Run all tests
npm run test:all

# Run examples (starts local server)
npm run examples

# Lint code
npm run lint

# Format code
npm run format
```

## Examples

Interactive examples are available in the `examples/` directory. To run them:

```bash
npm run examples
```

This will start a local web server at http://localhost:8000 and open the examples page in your browser.

Available examples:
- **Counter (Client-Only)**: Demonstrates component lifecycle, reactive rendering, templates, and CSS scoping

## FuseWire Component Checks

FuseWire ships reusable component validation checks that you can run against your own components. Import `runAllChecks` from `@fusewire/client/checks` — it dynamically discovers all available checks, so new rules are picked up automatically when you update the package.

### Quick setup

Create a test file in your project (e.g. `test/component-checks.test.js`):

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { runAllChecks } from '@fusewire/client/checks';

const componentDir = new URL('../src/components', import.meta.url).pathname;

describe('FuseWire Component Quality Checks', () => {
    it('all checks pass', async () => {
        const results = await runAllChecks(componentDir, {
            globalClasses: ['container', 'btn', 'btn-primary'],
        });
        const failures = results.filter((r) => r.violations.length > 0);
        if (failures.length > 0) {
            const msg = failures
                .flatMap((r) => r.violations.map((v) => `[${r.name}] ${v.message}`))
                .join('\n\n');
            assert.fail(msg);
        }
    });
});
```

### Configuration

`runAllChecks(componentDir, config)` accepts a `CheckConfig` object:

| Property | Type | Description |
|---|---|---|
| `globalClasses` | `string[]` | CSS class names available globally (e.g. Bootstrap utilities). Used by `css-class-consistency`. |
| `disabledChecks` | `string[]` | Check names to skip (e.g. `['var-jsdoc']`). |

### Available checks

| Check | What it validates |
|---|---|
| `css-class-consistency` | HTML classes match CSS selectors; CSS classes are used in HTML; nested CSS is valid in child context |
| `no-style-tags` | Component HTML files do not contain inline `<style>` tags |
| `var-jsdoc` | Every public class field has a `@type` JSDoc annotation with valid types |

### Writing custom checks

Add a `.js` file to the `checks/` directory following this convention:

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'my-check';

/**
 * Description of what this check validates.
 * @param {string} componentDir - Absolute path to the component directory
 * @param {import('./index.js').CheckConfig} config - Project-level configuration
 * @returns {Array.<import('./index.js').CheckViolation>} Violations found
 */
export function check(componentDir, config) {
    // Scan files, return [] if clean or [{file, message}] for violations
    return [];
}
```

The check is automatically discovered by `runAllChecks()` — no registration needed.

## License

MIT
