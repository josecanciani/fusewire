# Component Persistence & State Restoration

FuseWire features an aggressive, decentralized state orchestration engine called the **Persistence Module**. Since FuseWire operates without a virtual DOM, destroying and recreating components (e.g. swapping routes, closing a modal, handling hot-reloads) typically means losing all local state held within that component's class.

The Persistence module intercepts this destruction and freezes the component's state globally, automatically thawing it out the next time that specific component is requested.

## Concept: The State Envelope

State is stored inside the `Persistence` store inside a unified `StateEnvelope`:

```javascript
/**
 * @typedef {Object} StateEnvelope
 * @property {string} vars - Serialized component state variables
 * @property {object|null} extraState - Additional opaque data returned by destroy()
 */
```

### 1. `vars`
When an instance is removed via `InstanceRegistry.remove()`, the framework automatically sweeps all public class properties (`vars`) and passes them through the configured `StateSerializer`. Because `vars` are intrinsically understood by the framework, neither the parent nor the child requires any bespoke implementation to save them. A counter component's `this.count = 5` is trivially stored as `{"count":5}`.

### 2. `extraState`
A component might have internal, non-reactive `#private` state, third-party detached state (like the current scroll position of a CodeMirror instance or a playback cursor in an Audio element), or **expensive fetched data** that wasn't declared as a public var, but should absolutely survive being swapped out to prevent duplicate network hits.

During teardown, the framework invokes the component's synchronous `destroy()` hook. **If `destroy()` returns an object, that object is saved completely unmodified into the envelope's `extraState` bucket.**

```javascript
destroy() {
    // Standard cleanup
    this.#resizeObserver.disconnect();

    // Pass private state up to the Persistence orchestrator!
    return {
        editorCursorPos: this.#editor.getCursor(),
        hasPlayed: this.#hasPlayed,
        fetchedDataset: this.massiveDataset
    };
}
```

## Restoration: Thawing the Envelope

When the framework recreates a newly constructed component (e.g., navigating back to a previous page), the InstanceRegistry immediately queries the `Persistence` module.

If a `StateEnvelope` exists for this component's ID:
1. It ignores any default `vars` passed down by the parent mount point, opting to recursively merge the serialized `vars` from the envelope onto the fresh class instance.
2. It completely deletes the old `StateEnvelope` out of the Persistence engine. State is consumed **once**, preventing confusing phantom snapshots crossing wires infinitely.
3. It hands the `extraState` directly into the component's `init()` hook via the `previousState` parameter.

```javascript
async init(previousState) {
    if (previousState) {
        // Re-apply preserved private state!
        this.#startingCursor = previousState.editorCursorPos;
        this.#hasPlayed = previousState.hasPlayed;
    }
}
```

## Manual Override: Eager State Purging

Occasionally, a developer might *want* to forcibly overwrite a previously abandoned component with brand-new, explicit state, bypassing the Persistence layer entirely.

To do this, use **eager creation** from the parent `init()`:

```javascript
async init() {
    // By aggressively creating the Counter and aggressively passing vars `{ count: 0 }`,
    // the system natively wipes out any previously stored Counter state,
    // prioritizing the parent's explicit contract.
    this.counterRef = this.createChild('Counter', 'main', { count: 0 });
}
```

If the Component is instead heavily lazy or relies heavily on its own initial defaults, the component will seamlessly inherit whatever exact state it had previously cached right before its destruction.

## Custom Serializers & Storage

The overarching `Persistence` class is fully decoupled from the `Reactor` engine. By default, it operates as an in-memory `Map` passing through a customized `StateSerializer` optimized for serializing internal `Child` reference proxies.

However, developers can effortlessly configure massive state-dump implementations (e.g. IndexDB) simply by substituting the interface on the `Reactor` engine.

```javascript
// A totally customized memory sink!
const reactor = new Reactor('App', {
    persistence: new MyIndexedDBPersistenceModule()
});
```

## Server-Based Environments

While the above concepts form the foundation locally, FuseWire is designed to gracefully bridge client-side and server-side state.

In fully server-integrated environments leveraging the `fusewire-js` or `fusewire-php` backend libraries, the Persistence module capabilities are expanded. Server environments will provide additional options when rendering templates allowing the client to:
- Automatically seed the `Persistence` module with pre-calculated backend data on page load.
- Compare and optionally replace local client caching with fresh server state when the DOM responds to new server pushes.

(Consult the server-specific documentation for those respective libraries to learn how to configure backend state transfer rules.)
