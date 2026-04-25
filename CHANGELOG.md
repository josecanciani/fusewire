# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/josecanciani/fusewire/compare/1.0.0...main
[1.0.0]: https://github.com/josecanciani/fusewire/releases/tag/1.0.0
