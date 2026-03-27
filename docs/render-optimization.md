# Render Optimization

## Background

When a component re-renders, FuseWire produces new HTML from the template and uses idiomorph to morph the DOM. Two situations cause unnecessary work:

1. **Child component subtrees.** Idiomorph walks into every child mount point and diffs its content against the empty `<div>` in the new HTML, even though the child manages its own DOM.

2. **Large component lists.** A component array with hundreds of entries (e.g., a console log) forces idiomorph to diff the entire list on every update, even when only one item was appended.

## What the Framework Does

### Morph exclusion (automatic)

During a parent re-render, idiomorph skips child component mount points (`data-fusewire-id`) and reconciliation containers (`data-fusewire-each`). It still matches these elements by their attributes for additions, removals, and reordering, but it never descends into their content.

This is fully automatic -- every component with children benefits with no code changes.

### Reconciliation containers (automatic for component arrays)

When a template variable resolves to an array of `ComponentReference` values, the compiled HTML wraps the mount points in a `<div data-fusewire-each="varName">` container. On re-render, instead of morphing the list, the framework:

- Appends mount points for newly added components.
- Removes mount points for components no longer present.
- Leaves existing mount points untouched.

The existing child lifecycle (mount, re-render, orphan cleanup) runs as usual after reconciliation.

## Developer Guide

### Use ComponentReference arrays for large lists

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
    const id = String(this.vars.logs.length);
    this.vars.logs.push(this.createChild('LogLine', id, { level, message }));
    this.react();
}
```

Appending one item reconciles one mount point instead of diffing N elements.

### When to use each pattern

| Pattern | Use when |
|---|---|
| `fw-each` with plain data | Small, bounded lists (< 20 items) with simple HTML per item |
| `ComponentReference` array | Large or unbounded lists, complex per-item rendering, items with independent state |

### Interaction with fw-each

`fw-each` continues to work as before for plain data arrays. Reconciliation containers only apply to arrays of `ComponentReference` values rendered via `((variable))` interpolation. Mixed-content `fw-each` loops still use standard morphing but benefit from morph exclusion (idiomorph skips into child mount points within the loop).

## Performance

| Scenario | Before | After |
|---|---|---|
| Parent with N child components | Idiomorph walks N child subtrees | Skips N child subtrees |
| Append 1 item to list of N | Diffs N mount points + N subtrees | Appends 1 mount point, skips N |
| Remove 1 item from list of N | Diffs N mount points + (N-1) subtrees | Removes 1 mount point, skips N-1 |
| Re-render with no list changes | Walks entire list | Compares ID sets, no DOM mutations |
