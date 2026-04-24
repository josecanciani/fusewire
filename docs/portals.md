# Portals

## Overview

Portals allow a component to render children **outside its own DOM subtree** while maintaining the logical parent-child relationship for events, lifecycle, and cleanup. The primary use case is UI elements like modals, toasts, and overlays that need to escape CSS stacking contexts (`z-index`, `overflow: hidden`, `position: fixed` inside positioned parents).

## The Problem

Consider a shopping app where a `Header` component owns a cart button that opens a modal. The modal DOM must be at the top of the document to avoid being trapped by the Header's CSS positioning. Without portals, the root component (`Home`) must create the modal and wire events between `Header` and `Cart/Modal` — violating separation of concerns.

With portals, `Header` creates the modal directly. The modal renders in a PortalHost elsewhere in the DOM, but events flow back to `Header` as if it were a normal child.

## Architecture

Three built-in components work together:

| Component | Role |
|-----------|------|
| `FuseWire/Root` | Invisible wrapper around the user's app. Created automatically by `reactor.start()`. Contains the app + the default PortalHost. |
| `FuseWire/PortalHost` | Rendering container for portal children. Any component can create additional hosts. Children rendered via `fw-each`. |
| `FuseWire/PortalChild` | Invisible proxy that lives in the requesting component's tree. Connects to a PortalHost by ID. Forwards events bidirectionally. |

### Component tree example

```
FuseWire/Root (built-in, invisible)
├── Home (user's app)
│   ├── Header
│   │   └── PortalChild#cart-modal (empty DOM — proxy only)
│   └── Showcase
└── PortalHost#default
    └── Cart/Modal (real DOM — rendered here)
```

The `PortalChild` in Header's tree has no visible DOM. The real `Cart/Modal` renders inside the PortalHost at the root level, escaping Header's CSS context.

## Usage

### Basic: default PortalHost

```javascript
// In Header.js
async init() {
    // Creates a Cart/Modal in the default PortalHost (document.body level)
    this.cartModal = this.createPortalChild('Cart/Modal', 'main', { items: [] });

    // Subscribe to events — works exactly like normal children
    this.cartModal.on('closed', () => this.onModalClosed());
    this.cartModal.on('checkout', (items) => this.onCheckout(items));
}
```

Portal children do not need `((cartModal))` in the parent template — they
render in the PortalHost, not in the parent's DOM. The framework detects the
eagerly-created child and wires up event replay and parent-child tracking
automatically, even without a mount point.

No changes needed to the root component. The default PortalHost exists automatically.

### Custom PortalHost

Components can create additional PortalHosts for different rendering targets:

```javascript
// In App.js
async init() {
    this.sidebarPortal = this.createPortalHost('sidebar');
    this.mainContent = this.createChild('MainContent', 'main');
}
```

```html
<!-- App.html -->
<div class="layout">
    <aside>((sidebarPortal))</aside>
    <main>((mainContent))</main>
</div>
```

```javascript
// In any descendant component:
this.widget = this.createPortalChild('Widget', 'status', {}, 'sidebar');
```

## FuseWire/Root

`reactor.start()` transparently wraps the user's app component in a `FuseWire/Root` built-in. The user never interacts with it — `start()` returns the app instance as before.

**Template:** `((app))((portal))`

**Purpose:** Provides a DOM location for the default PortalHost without requiring the user's app template to include a portal mount point.

**Routing:** Returns `{}` from `routeState()` — structural pass-through. The router walks through it to reach the app component and its children.

## FuseWire/PortalHost

A built-in component that manages a list of portal children, rendered via `fw-each`.

**Template:** `<div fw-each="child in children">((child))</div>`

### API

| Method | Description |
|--------|------------|
| `addChild(name, id, vars)` | Create a child component, subscribe to its events via wildcard, and trigger a re-render. Returns the Child reference. |
| `removeChild(childCode)` | Remove a child by component code and trigger a re-render. |
| `broadcastToChild(childCode, eventName, args)` | Broadcast an event into a specific child's subtree. |

### Event interception

When the PortalHost creates a child via `addChild()`, it subscribes to **all** events from that child using the wildcard `on('*')` subscription:

```javascript
child.on('*', (eventName, ...args) => {
    this.emit('fw-portal-event', {
        childCode: child.componentCode,
        eventName,
        args,
    });
});
```

This wraps every event the child emits into a `fw-portal-event` on the PortalHost. The PortalChild listens for these wrapped events and unpacks them.

### Broadcast filtering

PortalHost subtrees are **excluded** from the normal broadcast tree walk in `_broadcastToEntry()`. Broadcasts reach portal children only via PortalChild forwarding. This prevents double-delivery.

### Routing

Returns `{}` from `routeState()` — structural pass-through.

## FuseWire/PortalChild

A built-in component with an empty template. Lives in the requesting component's tree as an invisible proxy. Connects to a PortalHost by ID and forwards events bidirectionally.

**Template:** `''` (empty — renders nothing)

### How it connects

1. During `init()`, the PortalChild asks the Reactor for the PortalHost by ID (async — waits if the host isn't mounted yet)
2. Calls `host.addChild(name, id, vars)` to create the real child
3. Subscribes to `fw-portal-event` on the PortalHost, filtering by child code
4. Re-emits matching events on itself, so the parent's `.on()` handlers fire

### Getting the real child instance

The PortalChild exposes a method to retrieve the real Component instance:

```javascript
// Get the real child (after it's ready)
const modal = this.cartModal.whenReady().then(portalChild => {
    return portalChild.getChild();
});
```

The `getChild()` method returns the real Component instance from the PortalHost. This is useful when the parent needs direct access (e.g., calling methods on the real child).

### Cleanup

When the PortalChild is destroyed (because its parent was destroyed), its `destroy()` method calls `host.removeChild(childCode)`. The PortalHost filters its children array and re-renders, causing the framework's orphan cleanup to destroy the real child.

## Event Flow

### Child → Parent (pub/sub)

```
1. Parent: this.cartModal.on('closed', handler)
   → buffered on Child reference → replayed on PortalChild

2. Real Cart/Modal: this.emit('closed')
   → PortalHost on('*') catches it
   → PortalHost emits fw-portal-event { childCode, 'closed', args }

3. PortalChild receives fw-portal-event, matches childCode
   → PortalChild re-emits: this.emit('closed', ...args)
   → Parent's handler fires
```

### Broadcast (top-down)

```
1. reactor.broadcast('theme', 'dark')
   → walks main tree: Root → Home → Header → PortalChild

2. PortalChild receives broadcast
   → calls host.broadcastToChild(childCode, 'theme', ['dark'])

3. PortalHost delegates: child.broadcast('theme', 'dark')
   → broadcast flows through real child's subtree

Note: PortalHost subtree is SKIPPED in the normal broadcast walk.
```

### Cleanup

```
Header destroyed (e.g., navigation)
  → cascade: PortalChild.destroy()
    → host.removeChild('Cart/Modal#main')
      → PortalHost filters children, reacts
        → orphan cleanup destroys Cart/Modal
          → Cart/Modal[EVENTS].clear() removes wildcard subscription
```

## EventEmitter: Wildcard Subscriptions

The portal system relies on a new EventEmitter capability: `on('*', handler)`.

Wildcard handlers receive **every** event emitted on the emitter. The first argument is the event name, followed by the original arguments:

```javascript
component.on('*', (eventName, ...args) => {
    console.log(`Event: ${eventName}`, args);
});
```

- All events are forwarded, including `fw-*` internal events
- Wildcard handlers are **observers** — they cannot stop broadcast propagation (returning `false` from a wildcard handler has no effect on `emitBroadcast`)
- Wildcard subscriptions are cleaned up automatically by `EventEmitter.clear()` when the component is destroyed

## Reactor Changes

The Reactor maintains a registry of PortalHosts:

| Method | Description |
|--------|------------|
| `registerPortalHost(id, host)` | Called by PortalHost during `init()`. Drains pending requests waiting for this host. |
| `unregisterPortalHost(id)` | Called by PortalHost during `destroy()`. |
| `getPortalHost(id)` | Async — returns the host or waits for it to register. |
| `getPortalHostSync(id)` | Sync — for destroy paths where the host must exist. |

### Pending requests

If a PortalChild's `init()` runs before its target PortalHost is mounted, `getPortalHost(id)` returns a Promise that resolves when the PortalHost registers itself. This handles arbitrary creation ordering.

## Component API

Two new methods on the `Component` base class:

```javascript
/**
 * Create a PortalHost at this location in the DOM.
 * @param {string} id - Unique identifier for this host
 * @returns {Child|Component} The PortalHost reference
 */
createPortalHost(id) { ... }

/**
 * Create a child that renders in a PortalHost instead of this component's DOM.
 * @param {string} name - Component name
 * @param {string} id - Instance ID
 * @param {ComponentVars} vars - Initial vars
 * @param {string} [portalHostId='default'] - Target PortalHost ID
 * @returns {Child|Component} The PortalChild reference
 */
createPortalChild(name, id, vars, portalHostId) { ... }
```
