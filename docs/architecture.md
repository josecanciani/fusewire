# FuseWire Client Library Architecture

## Overview

FuseWire is a client-side component framework for building reactive web applications. It provides a lightweight, modern approach to component-based UI development with minimal dependencies and no build step required.

## Core Concepts

### Components

Components are the fundamental building blocks. Each component:
- Has a unique identity (name + optional instance ID)
- Manages its own data (vars)
- Defines lifecycle hooks for initialization and updates
- Renders HTML templates with reactive updates

### Component Identity

Every component instance has:
- **Name**: The component class name (e.g., `Counter`, `UserList`)
- **Instance ID**: An optional identifier for multiple instances of the same component (e.g., `"main"`, `"sidebar"`)

Format: `ComponentName#instanceId` (e.g., `Counter#main`, `UserList`)

### Templates

Templates are plain HTML with FuseWire directives:
- **Variable interpolation**: `((variableName))` or `((object.property))`
- **Conditionals**: `<div fw-if="condition">...</div>`
- **Loops**: `<li fw-each="item in items">...</li>`
- **Component mount points**: Child components render as `<div data-fusewire-id="..."></div>`

Templates are compiled once into render functions for performance.

### CSS Scoping

CSS is automatically scoped per component using a container class. This prevents style collisions without Shadow DOM overhead.

### DOM Morphing

Updates use DOM morphing (idiomorph) to efficiently patch the existing DOM:
- Minimal changes to the actual DOM
- Preserves component boundaries
- Maintains focus and scroll position
- Faster than re-rendering from scratch

## Architecture

### Module Structure

```
src/
  component.js         # Base Component class
  component-id.js      # ComponentId helper
  event-emitter.js     # Per-component pub/sub service (used by on()/emit())
  reactor.js           # Main orchestrator
  instance.js          # Instance registry and lifecycle
  template-compiler.js # Template → render function
  template-store.js    # Template storage and versioning
  renderer.js          # DOM rendering with morphing
  config.js            # Configuration
  errors/
    error-hierarchy.js # Error classes
  utils/
    dom-helpers.js     # DOM utilities
```

### Component Lifecycle

```
1. Create
   - Instantiate component class
   - Set initial vars
   - Call init() hook (async)

2. Render
   - Compile template (once)
   - Generate HTML from vars
   - Morph DOM
   - Inject CSS (once per component name)

3. Update
   - Merge new vars via Component.update(newVars)
   - Re-render

4. Destroy
   - Call destroy() hook
   - Remove from registry
   - Remove DOM element
```

### Rendering Flow

```
react() called
    ↓
Get instance from registry
    ↓
Get template from store
    ↓
Compile template (if not cached)
    ↓
Render: vars + template → HTML
    ↓
Morph DOM (preserve child mount points)
    ↓
Find child mount points
    ↓
Recursively render children
    ↓
Call afterRender() hook
```

## Component Communication

Child components communicate with their parent through a lightweight pub/sub mechanism built into the `Component` base class.

### Subscribing (parent side)

A parent subscribes to a child's events in `afterRender()`, once the child instance has been mounted:

```javascript
afterRender() {
    if (!this._ready) {
        this._ready = true;
        this.sidebarComponent.on('selectDemo', (name) => this.selectDemo(name));
        this.sidebarComponent.on('back', () => this.back());
    }
}
```

`on()` returns an unsubscribe function. Subscriptions are cleared automatically when the child component is destroyed by the `InstanceRegistry`, so manual cleanup is not normally needed.

### Emitting (child side)

A child calls `this.emit()` from its own methods in response to user interaction:

```javascript
back() {
    this.emit('back');
}
```

`emit()` is intended for use within the component's own methods. Calling it from outside the component is possible but discouraged.

### Error isolation

If a handler throws, `emit()` catches the error, logs it via the component console, and continues calling remaining handlers. One bad handler never silences the others.

### Lifecycle guard

Calling `emit()` during `init()`, `update()`, or `afterRender()` triggers a console warning — listeners registered by the parent are typically set up in the parent's `afterRender()`, which runs after the child's lifecycle hooks. The emit still proceeds, but the warning signals a likely ordering problem.

## Design Decisions

### No Build Step

FuseWire uses native ES modules and runs directly in modern browsers. No transpilation, bundling, or compilation needed. This:
- Simplifies development workflow
- Reduces tooling complexity
- Enables faster iteration
- Works with standard debugging tools

### Separate Template Files

HTML, CSS, and JS are kept as separate files (not JSX or single-file components). This:
- Allows use of standard HTML/CSS tooling
- Maintains clear separation of concerns
- Works with existing editors and linters
- Avoids lock-in to custom formats

### Class-Based Components

Components are ES6 classes extending a base `Component` class. This:
- Leverages native JavaScript features
- Provides clear inheritance model
- Enables IDE type checking and autocomplete
- Familiar pattern for developers

### Instance Registry

All component instances are tracked in a central registry. This:
- Enables efficient lookups by ID
- Facilitates cleanup and memory management
- Supports instance reuse
- Provides debugging visibility

### Async Initialization

The `init()` hook is async, allowing components to:
- Fetch initial data
- Initialize async resources
- Set up event listeners
- Perform expensive setup without blocking

### Polymorphic update()

Both `Component` and `ComponentReference` expose an `update(newVars)` method. This lets parent code call `child.update({ badge: '2' })` regardless of whether the child has been instantiated:

- **Before mount**: The child is still a `ComponentReference`. `update()` shallow-merges vars locally; they will be used when the Component is created.
- **After mount**: The framework replaces the reference in the parent's vars with the real `Component` instance. The same `update()` call now reaches `Component.update()`, which merges vars and triggers a re-render.

Subclasses can override `update()` for custom logic (validation, derived state) and must call `super.update(newVars, react)`.

The `react` parameter (default `true`) controls whether the update triggers an immediate re-render. The server-side flow (`InstanceRegistry.update()`) passes `false` because it manages rendering explicitly.

### DOM Morphing Over Virtual DOM

Using idiomorph for DOM updates instead of virtual DOM:
- Direct DOM manipulation is fast in modern browsers
- No reconciliation overhead
- Simpler mental model
- Preserves component boundaries naturally

### Template Compilation

Templates are compiled into render functions for performance:
- Parsing happens once, not on every render
- Generated code is optimized
- No runtime template parsing overhead
- Variables and directives pre-processed

## Integration with Server

The client library can work standalone or integrate with a FuseWire server:

### Standalone (CSR_ONLY mode)
- Templates embedded in component classes or fetched as static files
- All data managed client-side
- No server communication

### Server-Integrated
- Templates served by server with versioning
- Components can fetch data from server
- Multiple rendering modes: CSR, SERVER, SERVER_WAIT, SSR
- Server-side component execution with `run()` methods

See the [FuseWire-JS server documentation](https://github.com/josecanciani/fusewire-js) for server integration details.

## Performance Considerations

### Template Compilation Caching
Compiled templates are cached in memory. The template string is compiled once; subsequent renders use the cached render function.

### DOM Morphing Efficiency
Idiomorph minimizes DOM operations by:
- Comparing old and new DOM trees
- Only applying necessary changes
- Preserving unchanged subtrees
- Reusing existing elements

Child component mount points are excluded from morphing via the `beforeNodeMorphed` callback -- idiomorph matches them by attributes but never descends into their rendered content. Arrays of `ComponentReference` values are wrapped in reconciliation containers that bypass morphing entirely in favor of key-based append/remove. See [Render Optimization](render-optimization.md) for details.

### CSS Injection Deduplication
CSS is injected once per component name (not per instance), preventing style duplication.

### Component Instance Reuse
When a component re-renders with new vars, the existing instance is updated rather than destroyed and recreated.

## Error Handling

### Error Hierarchy
```
FuseWireError
  ├── ComponentNotFoundError
  ├── TemplateNotFoundError
  └── RenderError
```

### Error Propagation
Errors during lifecycle hooks or rendering are caught and can be handled by:
1. Component's own error handling
2. Parent component error handlers
3. Framework default error handler (logs to console)

## Browser Compatibility

Requires modern browsers with support for:
- ES2020+ features (optional chaining, nullish coalescing, etc.)
- ES modules (`import`/`export`)
- `async`/`await`
- Template literals
- Destructuring

Tested in:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Future Enhancements

The following features are planned but not yet implemented in this client-only library:

- Service Worker caching (for templates and state)
- Deferred component loading
- Advanced error recovery with retry logic
- Error bubbling with `onError` hook
- Navigation/routing support
- Live push updates via WebSocket

These features are available in the full FuseWire-JS server integration.
