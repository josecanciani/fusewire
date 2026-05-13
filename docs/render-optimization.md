# Render Optimization

## Background

When a component re-renders, FuseWire produces new HTML from the template and uses idiomorph to morph the DOM. Two situations cause unnecessary work:

1. **Child component subtrees.** Idiomorph walks into every child mount point and diffs its content against the empty `<fw-mount>` in the new HTML, even though the child manages its own DOM.

2. **Large component lists.** A component array with hundreds of entries (e.g., a console log) forces idiomorph to diff the entire list on every update, even when only one item was appended.

## What the Framework Does

### Morph exclusion (automatic)

During a parent re-render, idiomorph skips child component mount points (`data-fusewire-id`) and reconciliation containers (`data-fusewire-each`). It still matches these elements by their attributes for additions, removals, and reordering, but it never descends into their content.

This is fully automatic -- every component with children benefits with no code changes.

### Reconciliation containers (automatic for component arrays)

When a template variable resolves to an array of `Child` values, the compiled HTML wraps the mount points in a `<fw-each data-fusewire-each="varName">` container. On re-render, instead of morphing the list, the framework:

- Appends mount points for newly added components.
- Removes mount points for components no longer present.
- Leaves existing mount points untouched.

The existing child lifecycle (mount, re-render, orphan cleanup) runs as usual after reconciliation.

## Developer Guide

### Use Child arrays for large lists

To benefit from reconciliation, model repeated content as child components instead of `fw-each` over plain data:

**Plain data (standard morphing):**

```html
<!-- Console.html -->
<div class="console-logs">
    <div fw-each="log in logs" class="log-((log.level))">((log.message))</div>
</div>
```

Every `react()` call diffs all N elements.

**Component array (reconciliation):**

```html
<!-- Console.html -->
<div class="console-logs">
    ((logs))
</div>
```

```js
// Console.js
_addLog(level, message) {
    const id = String(this.logs.length);
    this.logs.push(this.createChild('LogLine', id, { level, message }));
    this.react();
}
```

Appending one item reconciles one mount point instead of diffing N elements.

### When to use each pattern

| Pattern | Use when |
|---|---|
| `fw-each` with plain data | Small, bounded lists (< 20 items) with simple HTML per item |
| `Child` array | Large or unbounded lists, complex per-item rendering, items with independent state |

### Interaction with fw-each

`fw-each` continues to work as before for plain data arrays. Reconciliation containers only apply to arrays of `Child` values rendered via `((variable))` interpolation. Mixed-content `fw-each` loops still use standard morphing but benefit from morph exclusion (idiomorph skips into child mount points within the loop).

## Performance

| Scenario | Before | After |
|---|---|---|
| Parent with N child components | Idiomorph walks N child subtrees | Skips N child subtrees |
| Append 1 item to list of N | Diffs N mount points + N subtrees | Appends 1 mount point, skips N |
| Remove 1 item from list of N | Diffs N mount points + (N-1) subtrees | Removes 1 mount point, skips N-1 |
| Re-render with no list changes | Walks entire list | Compares ID sets, no DOM mutations |

## Native Keep-Alive (DOM Teleportation)

Because FuseWire decouples the component lifecycle from DOM presence, you can implement **Keep-Alive** components (instant resume with no state loss) entirely through standard JavaScript references, without needing any special wrapper components.

### The Problem
When a heavy component (like a WebGL canvas or a CodeMirror editor) is removed from the screen (e.g., via `<div fw-if="false">`), its physical DOM nodes are destroyed by the browser. If you bring it back later, it has to rebuild from scratch.

### The Solution: Keep the Reference
To implement a "Keep-Alive" component, simply keep the child reference in your parent component's variables, but hide it in the template using `fw-if`.

```javascript
// Parent.js
export class Tabs extends Component {
    editorComponent = this.createChild('HeavyEditor');
    activeTab = 'home';
    
    showEditor() {
        this.activeTab = 'editor';
        this.react();
    }
}
```

```html
<!-- Parent.html -->
<div fw-if="activeTab === 'editor'">
    <!-- 
      When activeTab is 'home', the DOM is removed from the document.
      Because 'editorComponent' is still stored in the JS vars, 
      the framework's Garbage Collector skips it! 
    -->
    ((editorComponent))
</div>
```

### How it works under the hood
1. **Detachment:** When `fw-if` evaluates to false, Idiomorph naturally removes the DOM nodes from the live document. However, the `InstanceRegistry` recognizes that `this.editorComponent` still exists in your variables. It suspends the component, preserving its internal state and holding onto its detached DOM tree in memory (including all event listeners!).
2. **Teleportation:** When `fw-if` evaluates to true again, the renderer produces a new, empty `<fw-mount>` placeholder. Instead of re-rendering the component from scratch, the framework's engine detects the existing instance and **physically teleports** the preserved DOM nodes (`appendChild`) directly into the new mount point.
3. **Resumption:** The component's `afterRender()` hook fires, allowing third-party widgets to recalculate their layout dimensions for their new placement on the screen. The entire process takes less than a millisecond.
