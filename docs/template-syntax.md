# Template Syntax

## Overview

FuseWire templates are plain HTML files with special directives for dynamic content. No JSX, no custom file format—just HTML with a few extensions.

## Variable Interpolation

### Basic Syntax

Use double parentheses `(( ))` to insert variable values:

```html
<h1>((title))</h1>
<p>Count: ((count))</p>
```

### Nested Properties

Access nested object properties with dot notation:

```html
<div>
  <h2>((user.name))</h2>
  <p>Email: ((user.email))</p>
  <p>Role: ((user.profile.role))</p>
</div>
```

### Undefined/Null Handling

If a variable is undefined or null, it renders as an empty string:

```html
<p>((missingVar))</p>  <!-- Renders: <p></p> -->
```

## Conditional Rendering

### Basic Conditionals

Use `fw-if` attribute to conditionally render elements:

```html
<div fw-if="isLoggedIn">
  Welcome back!
</div>

<div fw-if="!isLoggedIn">
  Please log in.
</div>
```

### Supported Conditions

- **Truthy check**: `fw-if="variableName"`
- **Falsy check**: `fw-if="!variableName"`
- **Nested properties**: `fw-if="user.isAdmin"`

### Examples

```html
<!-- Show if array has items -->
<ul fw-if="items.length">
  ...
</ul>

<!-- Show if array is empty -->
<p fw-if="!items.length">No items found.</p>

<!-- Show based on string value -->
<div fw-if="status">
  Status: ((status))
</div>
```

### Limitations

FuseWire uses **simple property path evaluation**, not JavaScript expressions:

**✅ Supported:**
```html
<div fw-if="isVisible"></div>
<div fw-if="!isHidden"></div>
<div fw-if="user.isAdmin"></div>
```

**❌ Not supported:**
```html
<div fw-if="count > 5"></div>           <!-- No comparisons -->
<div fw-if="isAdmin && isActive"></div> <!-- No logical operators -->
<div fw-if="status === 'ready'"></div>  <!-- No equality checks -->
```

**Workaround:** Compute these in your component:

```js
class MyComponent extends Component {
  async hydrate() {
    this.vars.shouldShow = this.vars.count > 5;
    this.vars.isReady = this.vars.status === 'ready';
  }
}
```

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

### Accessing Loop Item

Inside the loop, reference the current item:

```html
<div fw-each="user in users">
  <h3>((user.name))</h3>
  <p>Email: ((user.email))</p>
  <p>Role: ((user.role))</p>
</div>
```

### Nested Loops

Loops can be nested:

```html
<div fw-each="category in categories">
  <h2>((category.name))</h2>
  <ul>
    <li fw-each="item in category.items">
      ((item.title))
    </li>
  </ul>
</div>
```

### Empty Collections

If the collection is empty or undefined, nothing renders:

```html
<li fw-each="item in items">...</li>
<!-- If items is [], renders nothing -->
```

Combine with `fw-if` for empty states:

```html
<ul fw-if="items.length">
  <li fw-each="item in items">((item.name))</li>
</ul>
<p fw-if="!items.length">No items available.</p>
```

## Component Mount Points

### Child Components

When a variable value is a Component instance, it renders as a mount point:

```js
class Dashboard extends Component {
  async hydrate() {
    this.vars.sidebar = this.createChild('Sidebar', 'main', { collapsed: false });
  }
}
```

Template:
```html
<div class="dashboard">
  <aside>
    ((sidebar))
  </aside>
  <main>...</main>
</div>
```

Rendered HTML:
```html
<div class="dashboard">
  <aside>
    <div data-fusewire-id="Sidebar#main">
      <!-- Sidebar component content -->
    </div>
  </aside>
  <main>...</main>
</div>
```

### Arrays of Components

If a variable is an array of Components, each renders as a mount point:

```js
class UserList extends Component {
  async hydrate() {
    this.vars.users = [
      this.createChild('UserCard', 'user1', { name: 'Alice' }),
      this.createChild('UserCard', 'user2', { name: 'Bob' })
    ];
  }
}
```

Template:
```html
<div class="user-list">
  ((users))
</div>
```

Rendered:
```html
<div class="user-list">
  <div data-fusewire-id="UserCard#user1">...</div>
  <div data-fusewire-id="UserCard#user2">...</div>
</div>
```

## Event Handlers

### Referencing Component Instance

Use `((this))` to reference the component instance in event handlers:

```html
<button onclick="((this)).increment()">
  Increment
</button>

<input 
  type="text" 
  onkeyup="((this)).search(event)"
  value="((searchQuery))"
>
```

Component:
```js
class SearchBox extends Component {
  increment() {
    this.vars.count++;
    this.react();
  }
  
  search(event) {
    this.vars.searchQuery = event.target.value;
    this.react();
  }
}
```

### Why `((this))`?

The `((this))` placeholder is replaced with a reference to the component instance at runtime, allowing you to call methods defined on the component class.

## CSS Scoping

CSS is automatically scoped to prevent style collisions:

**Component.css:**
```css
.container {
  padding: 1rem;
  background: white;
}

h1 {
  color: blue;
}
```

**Generated (scoped):**
```css
.fusewire-component-ComponentName .container {
  padding: 1rem;
  background: white;
}

.fusewire-component-ComponentName h1 {
  color: blue;
}
```

The container element automatically gets the scoping class applied.

## Complete Example

**Counter.html:**
```html
<div class="counter">
  <h1>Counter: ((count))</h1>
  
  <div fw-if="count">
    <p>The count is: ((count))</p>
  </div>
  
  <div fw-if="!count">
    <p>Click the button to start counting</p>
  </div>
  
  <button onclick="((this)).increment()">
    Increment
  </button>
  
  <button onclick="((this)).reset()" fw-if="count">
    Reset
  </button>
  
  <div fw-if="history.length">
    <h2>History</h2>
    <ul>
      <li fw-each="item in history">
        ((item))
      </li>
    </ul>
  </div>
</div>
```

**Counter.js:**
```js
export class Counter extends Component {
  async hydrate() {
    if (!this.vars.history) {
      this.vars.history = [];
    }
  }
  
  increment() {
    this.vars.count++;
    this.vars.history.push(this.vars.count);
    this.react();
  }
  
  reset() {
    this.vars.count = 0;
    this.react();
  }
}
```

## Best Practices

### ✅ Do

- Keep templates focused on presentation
- Use computed properties for complex conditions
- Provide fallback content for empty states
- Use semantic HTML elements
- Keep event handler calls simple

### ❌ Don't

- Don't put logic in templates (use component methods)
- Don't use complex expressions in `fw-if`
- Don't nest components too deeply (performance)
- Don't forget to handle empty/null cases
- Don't use inline styles (use CSS files)

## Template Compilation

Templates are compiled into optimized render functions:

1. **Parse**: HTML is parsed to identify directives and variables
2. **Extract**: Variable references and control flow are extracted
3. **Generate**: A render function is generated that:
   - Evaluates conditionals
   - Iterates over collections
   - Interpolates variables
   - Wraps components in mount points

This compilation happens **once per component**, not on every render, making it fast.
