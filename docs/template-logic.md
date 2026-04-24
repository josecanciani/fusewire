# Template Programming Logic

## Design Philosophy

FuseWire templates are intentionally minimal: **you manage data in JavaScript, the template manages the UI**. Templates support only property access, conditionals, and iteration — no arithmetic, comparisons, or function calls. If you need derived values, compute them as component properties and interpolate the result.

For the full template reference (CSS scoping, mount points, event handlers), see [template-syntax.md](template-syntax.md).

## Interpolation: `(( ))`

Double parentheses insert a variable's value into the rendered output. The expression inside must be a **property path** — a variable name optionally followed by dot-separated property access.

```html
<h1>((title))</h1>
<p>((user.profile.role))</p>
```

### What Can Go Inside `(( ))`

| Kind | Example | Notes |
|---|---|---|
| Component property | `((count))` | Any public property on the component class |
| Nested property | `((user.name))` | Dot notation, arbitrary depth |
| Autocalculated property | `(($total))` | `$`-prefixed getter evaluated each render |
| Loop variable | `((item.label))` | Scoped to the enclosing `fw-each` |
| Array property | `((items.length))` | Reads `.length` like any other property |
| Component reference | `((this))` | Replaced with a `FuseWire.get()` call (event handlers only) |
| Child component | `((sidebar))` | Renders as a `<fw-mount>` mount point |

### Multiple Interpolations

Several interpolations can appear in the same text node. Each one is an independent property lookup on the component instance:

```html
<p>((firstName)) ((lastName))</p>
```

Here `firstName` and `lastName` are ordinary component properties — there is nothing special about these names. The component might define them as:

```js
class Greeting extends Component {
    async init() {
        this.firstName = 'John';
        this.lastName = 'Doe';
    }
}
```

Any property name works: `((city))`, `((errorMessage))`, `(($formattedDate))`. The template simply reads whatever properties the component exposes.

### Type Coercion and Safety

- All values are coerced to strings via `String(value)`.
- `undefined` and `null` render as **empty string** (no literal "undefined" or "null" text).
- Text content is HTML-escaped (`<`, `>`, `&`, `"`, `'`).
- Dangerous URL attributes (`href`, `src`, `action`, `on*`) are sanitized to block `javascript:`, `data:`, and `vbscript:` protocols.

## Conditional Rendering: `fw-if`

Renders the element only when the expression is truthy. Removes the entire element (and its children) when falsy.

```html
<div fw-if="isLoggedIn">Welcome back!</div>
<div fw-if="!isLoggedIn">Please log in.</div>
```

### Supported Expressions

- **Property path**: `fw-if="user.isAdmin"` — truthy check on a nested property.
- **Negation**: `fw-if="!isHidden"` — prefix `!` inverts the truthiness.
- **Array length**: `fw-if="items.length"` — `0` is falsy, any positive number is truthy.

Truthiness follows standard JavaScript rules: `false`, `0`, `""`, `null`, `undefined`, and `NaN` are falsy; everything else is truthy.

### Not Supported

Templates evaluate **property paths only** — no JavaScript expressions:

```html
<!-- None of these work -->
<div fw-if="count > 5"></div>
<div fw-if="isAdmin && isActive"></div>
<div fw-if="status === 'ready'"></div>
<div fw-if="items.includes('x')"></div>
```

### Autocalculated Properties

For conditions that require real logic, define a `$`-prefixed getter on the component. The framework evaluates these getters automatically before each render:

```js
class Dashboard extends Component {
    get $hasEnoughItems() {
        return this.items.length > 5;
    }

    get $isReady() {
        return this.status === 'ready' && this.isAdmin;
    }
}
```

```html
<div fw-if="$hasEnoughItems">Showing extended view</div>
<div fw-if="$isReady">Dashboard loaded</div>
```

This keeps templates declarative while supporting arbitrarily complex conditions in JavaScript.

### Nesting

`fw-if` elements can nest freely, including same-tag nesting:

```html
<div fw-if="outer">
    <div fw-if="inner">Both conditions are true</div>
</div>
```

## Iteration: `fw-each`

Repeats an element for each item in an array. Renders nothing if the collection is empty or undefined.

```html
<ul>
    <li fw-each="item in items">((item.name))</li>
</ul>
```

### Syntax

```
fw-each="variableName in collectionPath"
```

- **variableName**: a single identifier (`[a-zA-Z0-9_$]`). Becomes a scoped variable inside the loop.
- **collectionPath**: a dot-separated property path (e.g., `items`, `user.posts`).

### Loop Variable Scope

The loop variable is available in the element's content, attributes, nested directives, and event handlers:

```html
<li fw-each="item in items"
    data-id="((item.id))"
    onclick="((this)).select(((item.id)))">
    ((item.name))
</li>
```

The variable does not exist outside the `fw-each` element.

### Nested Loops

Loops can nest, each with its own scoped variable:

```html
<div fw-each="category in categories">
    <h2>((category.name))</h2>
    <ul>
        <li fw-each="item in category.items">((item.title))</li>
    </ul>
</div>
```

### Combining `fw-each` with `fw-if`

When both directives appear on the same element, the loop runs first, then the condition is evaluated per item. The loop variable is available to the `fw-if` expression:

```html
<li fw-each="item in items" fw-if="item.active">((item.name))</li>
```

This renders only the items where `item.active` is truthy.

### Empty State Pattern

Pair `fw-each` with a negated `fw-if` on the collection's length:

```html
<ul fw-if="items.length">
    <li fw-each="item in items">((item.name))</li>
</ul>
<p fw-if="!items.length">No items available.</p>
```

## What Templates Cannot Do

The template system deliberately excludes runtime expression evaluation:

| Feature | Status | Alternative |
|---|---|---|
| Arithmetic (`count + 1`) | Not supported | Compute in JS, expose as property |
| Comparisons (`count > 5`) | Not supported | Use a `$`-prefixed getter |
| Logical operators (`a && b`) | Not supported | Use a `$`-prefixed getter |
| Ternary (`cond ? a : b`) | Not supported | Use two `fw-if` blocks |
| Function calls (`format(x)`) | Not supported | Compute in JS, expose as property |
| Array indexing (`items[0]`) | Not supported | Expose the element as its own property |
| String concatenation | Not supported | Use multiple `(( ))` in sequence |

This constraint keeps templates predictable and pushes all logic into testable component code.
