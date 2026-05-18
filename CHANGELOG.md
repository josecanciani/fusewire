# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.1] - 2026-05-18
### Added
- New `src/builtins/` directory to cleanly separate internal framework components (Root, Lazy, ErrorBoundary, PortalHost, PortalChild) from core engine logic.

### Changed
- Refactored `Component` base class by stripping out internal event loop logic; error logging is now handled natively by `EventEmitter`.
- Internal framework broadcasts now utilize `emitBroadcast()` directly, improving performance and isolation.
- Extracted recursive event broadcasting into a standalone `broadcast.js` utility.
- Streamlined Demo Playground hydration to instantiate fresh IDs rather than persisting obsolete URL parameters.
- Improved Component Router lifecycle to fix UI flickering when eagerly creating children with route segments.

### Removed
- Removed deprecated `_emitCancellable`, `destroyChild`, and `peekRouteSegment` from the Component API.
- Deleted legacy `logger.js` and `config.js`.

## [1.4.0] - 2026-05-16
### Changed
- Optimized DOM reconciliation in `Renderer.js` to batch new element insertions using a `DocumentFragment` and avoid detached node tracking during massive component grid renders.
- Eliminated an O(N²) array scan bottleneck in `InstanceRegistry` when verifying unmounted children during massive DOM render cycles (like grid generation).
- Fixed massive layout thrashing in Safari by breaking component mounting into a 3-phase architecture: awaiting creation concurrently, performing all DOM node teleports in a single synchronous loop (guaranteeing zero interleaved rendering frames), and then resuming async hydration.

## [1.3.0] - 2026-05-14
### Fixed
- Fixed Safari CSS parsing failure by replacing Bootstrap's `with { type: 'css' }` ES module import with a standard `<link rel="stylesheet">` tag in `index.html`.

## [1.2.2] - 2026-05-13
### Fixed
- Fixed GitHub Pages deployment configuration to explicitly copy `@popperjs` dependency so Bootstrap ES modules resolve correctly in production.

## [1.2.1] - 2026-05-13
### Added
- Configured `rootDirs` in `jsconfig.json` to natively resolve relative browser imports (`../../js/`) in the IDE by virtually merging `htdocs/js` and `src`.
- Enabled full strict TypeScript compilation and type-checking for demo components in `htdocs/`.
- Integrated Bootstrap CSS as a CSS Module Script using Import Assertions (`with { type: 'css' }`).
- Mapped `@popperjs/core` as an external dependency to natively support Bootstrap ES modules in the browser.

### Changed
- Refactored core component factories (`createChild`, `createLazyChild`, `createPortalChild`, etc.) to use TypeScript Contextual Inference (`@returns {T}`). This automatically types child instances based on their class field declarations, eliminating the need for verbose inline JSDoc casting.

### Fixed
- Fixed 28 undocumented implicit `any` type errors across the playground and site demo components.
- Fixed Playwright test timeouts by properly resolving the missing Popper dependency that crashed Bootstrap initialization.
- Fixed a URL serialization bug in `HistoryRouter` where pass-through parent components caused child segments to be dropped or incorrectly serialized, resulting in broken deep links upon page refresh.

## [1.2.0] - 2026-05-13
### Changed
- Updated browser tests to inherit Playwright Base URL for robustness against dev server termination.

## [1.1.3] - 2026-05-13
### Fixed
- Fixed GitHub Pages deployment configuration to correctly copy the `docs/` folder to the public site.
- Updated `Docs` component to use relative paths (`./docs/`) for fetching markdown files when hosted in a subpath.

## [1.1.2] - 2026-05-13
### Fixed
- Fixed GitHub Pages deployment configuration to install and copy third-party frontend dependencies (Bootstrap, CodeMirror, Marked) instead of ignoring them.
- Updated root `index.html` to use relative paths (`./node_modules/`) to properly resolve vendor dependencies when hosted in a subpath.

## [1.1.1] - 2026-05-13
### Fixed
- Fixed broken dynamic imports in the website demo components by using relative paths (`../../js/`) to ensure proper module resolution when deployed under GitHub Pages subpaths.

## [1.1.0] - 2026-05-13
### Added
- Implemented robust DOM Teleportation during reconciliation: existing DOM elements are preserved and moved instead of re-rendered when mount points change, drastically improving performance and preserving third-party widget states.
- 100% strict TypeScript and JSDoc typing for all framework core files (`src/*.js`).
- New `Site` components for building full documentation web pages (`Landing`, `Main`, `Docs`).
- Integration tests in Playwright for browser-native navigation and playground components.
- Added the `fw-ignore` template directive to instruct the DOM morphing engine to skip specific subtrees, safely preserving un-synced state for third-party libraries (like CodeMirror or Leaflet).
- New `template-vars` quality check to ensure all variables used in HTML templates are defined as public members in the component's JS file.
- Enforced `$` prefix convention for calculated variables: public getters must start with `$`, and public class fields must not.
- Added regression tests for `>` operator handling in `fw-if` directives.

### Changed
- Replaced ES Module import mapping of idiomorph with a local vendored version (`src/vendor/idiomorph.js`) to fix deployment compatibility.
- Updated npm scripts and linter configurations (`.oxlintignore`, `.oxfmtignore`) to exclude vendor files seamlessly.
- Greatly improved Playground robustness with lazy-loading demos inside Error Boundaries to prevent single-demo crashes from affecting the entire page.
- Rewrote the core unit test suite to leverage the native Node.js test runner exclusively with stricter console mocking.
- Updated architectural documentation to formalize the "Data Down, Events Up" pattern for interacting with child components asynchronously via `update()`.
- Enhanced component check runner to display the total number of components inspected during a run.

### Fixed
- Fixed nested route hydration on initial page load in `HistoryRouter`.
- Fixed performance regressions in `InstanceRegistry._mountChild` where unchanged components were triggering unnecessary render cycles.
- Fixed var extraction in `InstanceRegistry.createFromReference` to support directly instantiated `Component` class instances, not just `Child` config objects.
- Fixed an unhandled Promise rejection crash that occurred when an eagerly-created child component threw an error before completing its initial render.
- Fixed a rendering pipeline crash (`Cannot set properties of undefined`) caused when an ErrorBoundary intercepted a failed eager child.
- Fixed a bug where hidden Keep-Alive components (`fw-if="false"`) would fail to receive buffered event listeners during state restoration.
- Fixed a bug in the template parser where `>` characters inside quoted attribute values would prematurely terminate tag matching, causing syntax errors to be ignored by quality checks.
- Fixed lint errors in `src/history-router.js` by standardizing on single quotes for imports.

## [1.0.2] - 2026-04-25
### Added
- Created `AGENTS.md` in parser directory explaining the generated parser workaround.

### Changed
- Refactored `idiomorph` loading to use ES Module import maps instead of vendoring the library inside `src/`.
- Updated GitHub Pages deployment action to explicitly enable pages and correctly serve `idiomorph` from node modules.
- Re-added `fusewire-expr.d.ts` localized type override to prevent TypeScript performance crashes when analyzing Jison output.

## [1.0.1] - 2026-04-25
### Added
- New AST-based template expression parser with nested ternaries and strict syntax validation.

### Removed
- Deprecated regex-based expression evaluation in favor of the formal Jison AST parser.
- Removed JS-in-HTML inline execution possibilities to strictly enforce declarative JS state truth.

## [1.0.0] - 2026-04-25
### Added
- URL navigation and history router.
- Global portal system (`PortalHost`, `PortalChild`) for modals, overlays, and toasts.
- `ErrorBoundary` component and `fw-error` bubbling system.
- Support for `$`-prefixed autocalculated getters for declarative state-derived truths.
- Declarative conditionals (`fw-if`) and loops (`fw-each`) with proper nesting support.
- Parallel child component template fetching and lazy-loaded components (`createLazyChild`).
- Component lifecycle hooks (`init()`, `render()`, `hydrate()`, `afterRender()`, `destroy()`).
- Pub/Sub event system (`on()` and `emit()`) and top-down global broadcasts (`broadcast()`).
- Scoped DOM querying methods (`querySelector`, `querySelectorAll`, `getElementsByClassName`).
- `loadLibrary()` for lazy loading JavaScript module dependencies.
- Strict TypeScript compliance, generating `.d.ts` definitions from extensive JSDoc types.
- Comprehensive CLI build tools for linting (`oxlint`, `eslint`), formatting (`oxfmt`), and testing (Node test runner + Playwright).

### Changed
- Complete rewrite of the client library to use ES2020 modules, modernizing the architecture.
- Decoupled state management into a private persistence orchestrator.
- Redesigned `InstanceRegistry` for robust component lifecycle and auto-mounting logic.
- Modernized the Playground UI with multi-column layout and directional resizers.
- Upgraded components to use standard class public properties instead of a magic `componentVars` object.

### Removed
- Removed JS-in-HTML inline execution possibilities to strictly enforce declarative JS state truth.

[Unreleased]: https://github.com/josecanciani/fusewire/compare/1.4.1...main
[1.4.1]: https://github.com/josecanciani/fusewire/compare/1.4.0...1.4.1
[1.4.0]: https://github.com/josecanciani/fusewire/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/josecanciani/fusewire/compare/1.2.2...1.3.0
[1.2.2]: https://github.com/josecanciani/fusewire/compare/1.2.1...1.2.2
[1.2.1]: https://github.com/josecanciani/fusewire/compare/1.2.0...1.2.1
[1.2.0]: https://github.com/josecanciani/fusewire/compare/1.1.3...1.2.0
[1.1.3]: https://github.com/josecanciani/fusewire/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/josecanciani/fusewire/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/josecanciani/fusewire/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/josecanciani/fusewire/compare/1.0.2...1.1.0
[1.0.2]: https://github.com/josecanciani/fusewire/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/josecanciani/fusewire/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/josecanciani/fusewire/releases/tag/1.0.0
