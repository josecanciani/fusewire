# Parallel Component Creation

## Implementation Status

| Feature | Status |
|---|---|
| Eager child creation (`createChild` kicks off immediately) | Implemented |
| Detached rendering (children render off-document) | Implemented |
| Deferred hydration (bottom-up `hydrate()` after attachment) | Implemented |
| Template request deduplication (in-flight sharing) | Implemented |
| Error fallback components (`fallback` option) | Implemented |
| Lazy child components (`createLazyChild` with placeholder) | Implemented |
| Batched template fetching (DataLoader pattern) | Planned |

## Problem

When a parent component declares multiple children, the current framework creates them sequentially during the parent's render phase:

```
parent.init()
parent.render()        ← DOM rendered, mount points found
  _mountChild(A)       ← A must finish before B starts
    A.init()           ← may fetch data (500ms)
    A.render()
    A.hydrate()
    A.afterRender()
  _mountChild(B)       ← blocked by A
    B.init()
    B.render()
    B.hydrate()
    B.afterRender()
parent.hydrate()
parent.afterRender()
```

Total time: `parent.render + A.init + B.init` (sequential). If A has a 500ms fetch, B waits the entire time even though they are independent. Template fetching has the same problem — each component fetches its HTML and CSS individually.

## Design

### Eager child creation

When `createChild()` is called in `init()`, the framework starts the child's creation pipeline immediately instead of waiting for the parent's render to discover mount points:

```
parent.init()
  createChild('A') → starts: fetch A template + create A + A.init()
  createChild('B') → starts: fetch B template + create B + B.init()
  // A and B are initializing in parallel

parent.render()    → parent template to DOM, mount points found
  for each mount point:
    await ref.creationPromise   → likely already complete
    attach child's pre-rendered DOM into mount point
    _replayBufferedEvents()
    child.hydrate()             → element is now in the document
    child.afterRender()

parent.hydrate()
parent.afterRender()
```

Total time: `max(parent.render, max(A.init, B.init))`. Children initialize concurrently with each other and with the parent's render.

### Detached rendering

Children render into a detached DOM element before being placed in the document. This decouples child creation from mount point discovery:

1. `createChild()` creates a detached container element for the child.
2. The child's `init()` and `render()` run against this detached container. Idiomorph works on DOM trees regardless of document attachment.
3. When the parent renders and mount points are found, the child's rendered DOM is moved into the mount point element.
4. `hydrate()` runs after attachment — the element is now in the document with correct layout. DOM queries, `ResizeObserver`, `getBoundingClientRect`, and third-party widgets work correctly.

This is why `hydrate()` exists as a separate hook from `init()`: `init()` runs before the element is in the document (possibly detached), while `hydrate()` runs after attachment when layout is available.

### Recursive parallelism

The pattern applies recursively. If child A has its own children (grandchildren), those are kicked off eagerly during A's `init()`, running in parallel with B and with each other:

```
parent.init()
  createChild('A') → A.init() starts
                       A calls createChild('C'), createChild('D')
                       C.init() and D.init() start in parallel
  createChild('B') → B.init() starts
                       B calls createChild('E')
                       E.init() starts
```

The entire component tree fans out concurrently. Each level of depth starts as soon as the parent's init runs.

## Batched Template Fetching

### Problem

Today each component fetches its template individually — 2 HTTP requests per component (HTML + CSS). Three children = 6 requests. Even with parallel creation making them concurrent, the request count is high.

### DataLoader pattern

Template requests are collected during a microtask window and flushed as a single batch:

```
Synchronous execution (parent.init):
  createChild('A') → queue: need template A
  createChild('B') → queue: need template B
  createChild('C') → queue: need template C

End of microtask (queueMicrotask callback):
  Flush → single request: GET /components/_batch?names=A,B,C
  → server returns all three templates in one response
```

When child inits complete and declare their own children, those template requests are collected in the next synchronous batch:

```
A.init(), B.init(), C.init() run in parallel:
  A: createChild('D'), createChild('E') → queue: need D, E
  B: createChild('F')                   → queue: need F

End of microtask:
  Flush → single request: GET /components/_batch?names=D,E,F
```

**Total: 2 round trips for 6 components** — one per level of tree depth, regardless of breadth.

### Implementation

The `TemplateStore` gains a request queue with microtask batching:

- `requestTemplate(name, basePath)` returns a `Promise`. If the template is already cached, resolves immediately. Otherwise, adds the name to a pending queue and schedules a microtask flush (if not already scheduled).
- `#flushBatch()` runs on the next microtask. It takes all pending names, clears the queue, and sends a single batch request. Each pending promise is resolved when the response arrives.
- Deduplication is built in — if two `createChild()` calls request the same template name, only one entry is queued.

### Server endpoint

The batch endpoint accepts multiple component names and returns all templates in one response:

```
GET /components/_batch?names=A,B,C

{
  "A": { "htmlCode": "...", "cssCode": "...", "version": "abc123" },
  "B": { "htmlCode": "...", "cssCode": "...", "version": "def456" },
  "C": { "htmlCode": "...", "cssCode": "...", "version": "ghi789" }
}
```

### Fallback

If the batch endpoint is not available (client-only mode, older server), the template store falls back to individual concurrent fetches via `Promise.all`. The optimization is progressive — better with a server, graceful without one.

## Error Fallbacks

### Problem

When a child component fails during creation (init throws, template not found, etc.), the error propagates to the parent, which fails, which propagates to the grandparent, and so on — one broken leaf crashes the entire app.

### Design: fallback components

The developer declares an error fallback at the `createChild()` call site:

```javascript
this.chart = this.createChild('Analytics/Chart', 'chart', {}, {
    fallback: 'Common/ErrorCard',
});
```

If Chart's creation fails, the framework renders ErrorCard in its place. The parent continues operating normally. The developer opts in per-child — only non-critical children get a fallback.

Without a `fallback` option, errors propagate as today (safe default, bugs are visible).

### Fallback vars

The framework passes context to the fallback component as vars:

```javascript
// Internally, the framework creates:
createChild('Common/ErrorCard', 'chart', {
    errorMessage: error.message,
    failedComponent: 'Analytics/Chart',
});
```

The fallback component is a regular component — it receives vars, renders a template, works like any other component. The developer designs the error UI.

### Behavior

When a child's creation promise rejects and a `fallback` is declared:

1. The framework creates the fallback component in the child's mount point.
2. The parent's reference (`this.chart`) becomes the fallback instance, not a Chart.
3. Buffered `.on()` calls replay onto the fallback — the fallback likely doesn't emit those events, so handlers never fire. This is harmless.
4. The parent's lifecycle continues normally.

When no `fallback` is declared:

1. The error propagates through `_mountChild` → `render` → `create`.
2. The parent's creation fails.
3. The grandparent's `_mountChild` receives the error — if the grandparent declared a fallback for the parent, it kicks in. Otherwise the error continues upward.
4. If no ancestor has a fallback, the app crashes (current behavior).

### API

The `createChild` signature gains an optional options parameter:

```javascript
createChild(name, id, vars, options)
```

| Option | Type | Description |
|---|---|---|
| `fallback` | `string` | Component name to render if creation fails. |

## Lazy Child Components (createLazyChild)

### Problem

Some children are expensive to load (large JS, complex templates) but not critical for the initial render. The parent should render immediately without waiting.

### Design: placeholder components

`createLazyChild()` works like `createChild()` but renders a placeholder while the real child loads:

```javascript
this.chart = this.createLazyChild('Analytics/HeavyChart', 'chart', {}, {
    placeholder: 'Common/Skeleton',
    fallback: 'Common/ErrorCard',
});
```

Three states for a child:

| State | What renders | Transition |
|---|---|---|
| Loading | Placeholder component | Real child's creation completes |
| Ready | Real component | — |
| Failed | Fallback component | Creation promise rejects |

### Behavior

1. `createLazyChild()` returns a `ComponentReference` (same as `createChild()`).
2. During the parent's render, the mount point shows the placeholder component.
3. The real child's creation runs in the background (parallel, detached).
4. When the real child is ready, the framework swaps the placeholder for the real component — the mount point's DOM is replaced.
5. `hydrate()` and `afterRender()` run on the real child after swap.
6. If creation fails and `fallback` is set, the fallback replaces the placeholder.

### Placeholder vs fallback

Both are regular components rendered in the child's mount point. The difference is when they appear:

- **Placeholder** — shown while loading, replaced when the real child is ready. Temporary.
- **Fallback** — shown when creation fails. Permanent (unless the parent retries).

`placeholder` defaults to a built-in skeleton component if not specified. `fallback` defaults to none (errors propagate).

### Unified pattern with createChild

`createChild()` and `createLazyChild()` share the same options:

```javascript
// Eager: parent waits for child before completing render
this.critical = this.createChild('Dashboard', 'main', {}, {
    fallback: 'Common/ErrorCard',
});

// Lazy: parent renders immediately, child loads in background
this.chart = this.createLazyChild('Analytics/Chart', 'chart', {}, {
    placeholder: 'Common/Skeleton',
    fallback: 'Common/ErrorCard',
});
```

The `fallback` option works identically in both cases. The only difference is timing: `createChild` blocks the parent's render until the child is ready (or fails), while `createLazyChild` lets the parent render immediately with a placeholder.

## Edge Cases

### Child init() fails

- **With fallback**: Framework renders fallback component in the mount point. Parent continues. See [Error Fallbacks](#error-fallbacks).
- **Without fallback**: Error propagates to parent. Parent creation fails. Grandparent receives the error and applies its own fallback logic (or propagates further).

### Dynamic children (created outside init)

Children created in event handlers (e.g., `selectDemo()`) work the same way. `createChild()` kicks off eager creation immediately. When `react()` triggers the parent's re-render, the child is likely already initialized:

```javascript
selectDemo(name) {
    this.editor = this.createChild('Editor', 'editor', { files }, {
        fallback: 'Common/ErrorCard',
    });
    this.editor.on('runDemo', () => this.runDemo());
    this.react();
    // During render: editor is likely ready, attached immediately
}
```

If the child isn't ready by render time, the mount phase awaits the creation promise (brief block).

**Re-render safety:** When a parent re-renders without creating new children, `startEagerCreation()` checks whether the component already exists in the instance registry and skips creation. This is critical for components that call `createChild()` on every render cycle (e.g., a grid where `createChild()` is called for each existing cell in a loop). Without this guard, re-renders would attempt duplicate creation and fail.

### Same component used twice

Two instances of the same component name share the template (already cached after first fetch). The batch deduplicates template requests. Only instance creation (new, init, render) runs twice — correctly, since they are separate instances.

### Detached rendering limitations

Children render into detached DOM elements. CSS layout computations (`offsetWidth`, `getBoundingClientRect`) return 0 on detached elements. This is safe because:

- `init()` and `render()` set data and produce HTML — no layout needed.
- `hydrate()` runs after attachment, when the element is in the document with real layout. All DOM measurement and third-party widget setup belongs in `hydrate()`.

### Sibling depends on sibling

If child B's vars depend on child A's data, this is inherently sequential — A must complete before B can be created. This pattern is rare and requires the parent to orchestrate the dependency (e.g., parent fetches the data, passes it to both children as vars). Parallel creation doesn't make this worse or better.

### Template caching

After the first load, templates are cached in the template store. Subsequent `createChild()` calls skip the fetch entirely. The batch optimization matters most on first page load; after that, creation is dominated by `init()` time.

## Migration

### No breaking changes

The eager creation model is an internal optimization. The `createChild()` API signature gains an optional `options` parameter, but existing code without options continues to work identically:

```javascript
// Existing code — still works, now faster
this.child = this.createChild('MyComponent', 'main', { count: 0 });
```

### New capabilities

```javascript
// Error fallback (new)
this.child = this.createChild('MyComponent', 'main', { count: 0 }, {
    fallback: 'Common/ErrorCard',
});

// Lazy loading (new)
this.child = this.createLazyChild('HeavyComponent', 'main', {}, {
    placeholder: 'Common/Skeleton',
    fallback: 'Common/ErrorCard',
});
```

### Lifecycle hook usage

| Hook | When | Use for |
|---|---|---|
| `init()` | Before render, possibly detached | Create children, load libraries, subscribe to events, set state |
| `hydrate()` | After first render, element in document | DOM queries, ResizeObserver, third-party widgets, `this.library()` |
| `afterRender()` | After every render | Scrolling, measuring, per-render DOM work |

The separation between `init()` (pre-attachment) and `hydrate()` (post-attachment) becomes significant with detached rendering. Code that needs layout must be in `hydrate()` or `afterRender()`.
