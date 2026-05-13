# Template Syntax

## Design Philosophy

FuseWire templates are intentionally minimal: **you manage data in JavaScript, the template manages the UI**. No JSX, no custom file format—just plain HTML files with special directives for dynamic content.

Templates support property access, conditionals, and iteration. To keep templates predictable and logic in testable component code, they deliberately exclude complex runtime expression evaluation like arithmetic, comparisons, or function calls. If you need derived values, compute them in JavaScript and expose them as component properties.

## Variable Interpolation

### Basic Syntax

Use double parentheses `(( ))` to insert variable values. The expression inside must be a **property path**—a variable name optionally followed by dot-separated property access.

```html
<h1>((title))</h1>
<p>Count: ((count))</p>
<p>Role: ((user.profile.role))</p>
```

### Multiple Interpolations

Several interpolations can appear in the same text node. Each one is an independent property lookup on the component instance:

```html
<p>((firstName)) ((lastName))</p>
```

### Type Coercion and Safety

- All values are coerced to strings via `String(value)`.
- `undefined` and `null` render as **empty string** (no literal "undefined" or "null" text).
- Text content is HTML-escaped (`<`, `>`, `&`, `"`, `'`).
- Dangerous URL attributes (`href`, `src`, `action`, `on*`) are sanitized to block `javascript:`, `data:`, and `vbscript:` protocols.

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

## Conditional Rendering

### Basic Conditionals

Use `fw-if` attribute to conditionally render elements. The element (and its children) are removed when the expression is falsy.

```html
<div fw-if="isLoggedIn">
  Welcome back!
</div>

<div fw-if="!isLoggedIn">
  Please log in.
</div>
```

Truthiness follows standard JavaScript rules: `false`, `0`, `""`, `null`, `undefined`, and `NaN` are falsy; everything else is truthy.

### Supported Expressions

- **Truthy check**: `fw-if="variableName"`
- **Falsy check**: `fw-if="!variableName"`
- **Nested properties**: `fw-if="user.isAdmin"`
- **Array length**: `fw-if="items.length"` — `0` is falsy, any positive number is truthy.

## Ternary Expressions

Templates support simple ternary logic for choosing between two values. This is especially useful for dynamic classes or attributes.

```html
<div class="(( isActive ? 'active' : 'inactive' ))">
  (( isAdmin ? 'Administrator' : 'Standard User' ))
</div>
```

The condition and both result expressions can be property paths or strings.

## Loops

### Basic Loop

Use `fw-each` to repeat elements:

```html
<ul>
  <li fw-each="item in items">
    ((item.name))
  </li>
</ul>
```

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

### Combining `fw-each` with `fw-if`

When both directives appear on the same element, the loop runs first, then the condition is evaluated per item:

```html
<li fw-each="item in items" fw-if="item.active">((item.name))</li>
```

### Empty Collections

If the collection is empty or undefined, nothing renders. Combine with `fw-if` for empty states:

```html
<ul fw-if="items.length">
  <li fw-each="item in items">((item.name))</li>
</ul>
<p fw-if="!items.length">No items available.</p>
```

## Modern Approach: Autocalculated Variables

For logic that requires comparisons, arithmetic, or complex conditions, define a deterministic derived variable using a getter prefixed with `$`. The framework auto-evaluates these getters during render:

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

Template:
```html
<div fw-if="$hasEnoughItems">Showing extended view</div>
<div fw-if="$isReady">Dashboard loaded</div>
```

## Limitations

FuseWire uses a lightweight expression parser, not full JavaScript execution.

**✅ Supported:**
- Property paths (`user.name`)
- Negation (`!isAdmin`)
- Ternary (`cond ? 'a' : 'b'`)
- Strings in ternary (`'active'`)

**❌ Not supported:**
- Arithmetic (`count + 1`)
- Comparisons (`count > 5`)
- Logical operators (`a && b`)
- Function calls (`format(x)`)
- Array indexing (`items[0]`)

## Component Mount Points

### Child Components

When a variable value is a Component instance, it renders as a mount point:

```js
class Dashboard extends Component {
  async init() {
    this.sidebar = this.createChild('Sidebar', 'main', { collapsed: false });
  }
}
```

Template:
```html
<div class="dashboard">
  <aside>((sidebar))</aside>
  <main>...</main>
</div>
```

### Arrays of Components

If a variable is an array of Components, each renders as a mount point:

```html
<div class="user-list">
  ((users))
</div>
```

## Event Handlers

Use `((this))` to reference the component instance in event handlers:

```html
<button onclick="((this)).increment()">
  Increment
</button>
```

The `((this))` placeholder is replaced with a reference to the component instance at runtime, allowing you to call methods defined on the component class.

## CSS Scoping

CSS is automatically scoped per component:

**Component.css:**
```css
.container { background: white; }
h1 { color: blue; }
```

**Generated (scoped):**
```css
.fusewire-component-ComponentName .container { background: white; }
.fusewire-component-ComponentName h1 { color: blue; }
```

### Styling Child Components

To style a child component from the parent, use a descendant selector to penetrate the mount boundary:

```css
/* ✅ RIGHT: Targets the physical div inside the child mount point */
.user-list .UserCard .user-card-body {
  background-color: #f5f5f5;
}
```

**Note:** If child components are inside an `<fw-each>`, do NOT use the direct child combinator (`>`) because the `<fw-each>` tag acts as an invisible DOM wrapper.

## Template Compilation

Templates are compiled once per component into optimized render functions. This compilation happens during the first instantiation, making subsequent renders extremely fast.
