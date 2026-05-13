# CSS Scoping and Theming

FuseWire automatically scopes component CSS to prevent style leakage between components without using complex build-time tooling or runtime CSS-in-JS.

## How Scoping Works

When you create a component `MyComponent.css`, the framework does not leave the CSS as-is. Instead, it "boxes" your entire stylesheet using native CSS nesting.

If your application name is `site`, the framework wraps your CSS like this:

```css
/* Input: MyComponent.css */
.card { background: white; }
.card .title { font-weight: bold; }

/* Output (Scoped): */
.site {
  .MyComponent {
    .card { background: white; }
    .card .title { font-weight: bold; }
  }
}
```

This ensures that a `.card` rule in `MyComponent` will never affect a `.card` in `OtherComponent`, as the latter will be boxed inside its own `.OtherComponent` class.

## The Ancestor Context Problem

Because FuseWire uses "boxing" (wrapping your CSS in a parent class) rather than "tagging" (adding unique attributes to every element like Vue or Svelte), your component CSS is unaware of attributes set on ancestor elements like `<html>` or `<body>`.

For example, this will **not** work by default:

```css
/* In MyComponent.css */
[data-bs-theme="dark"] .card {
    background: black;
}
```

The framework transforms this into `.site .MyComponent [data-bs-theme="dark"] .card`, which effectively says: "Style the card only if `data-bs-theme` is **inside** MyComponent."

## The Recommended Solution: CSS Variables

To handle global context like themes while keeping components isolated, FuseWire recommends the **Provider Pattern** using CSS variables.

### 1. Root Attribute
Place your theme attribute on the root component of your application.

```html
<!-- Main.html -->
<div class="site-main" data-bs-theme="((theme))">
    ((childContent))
</div>
```

### 2. Define Variables at the Provider
In your root component's CSS, define your theme variables anchored to that attribute.

```css
/* Main.css */
.site-main[data-bs-theme="light"] {
    --bg-color: #ffffff;
    --text-color: #000000;
}

.site-main[data-bs-theme="dark"] {
    --bg-color: #000000;
    --text-color: #ffffff;
}
```

### 3. Consume Variables in Components
Since CSS variables are inherited by all descendants, your child components can use them without needing to know about the theme attribute.

```css
/* Landing.css */
.hero {
    background-color: var(--bg-color);
    color: var(--text-color);
}
```

## Unidirectional Dependency Tree

A core philosophy of FuseWire is that **parents know their children, but children never know their parents.** This creates a clear, one-way dependency tree that makes the codebase easier to reason about.

Our CSS scoping model ("boxing") directly supports this:

1.  **Child Autonomy:** A child component defines its own default styles. It is completely unaware of where it will be placed (e.g., in a sidebar, a modal, or a list).
2.  **Parent Authority:** Because the child is physically rendered inside the parent's "box", the parent can optionally reach in and modify the child's layout or appearance to fit the current context.

### Example: Parent-Driven Overrides

If a `Button` component is used inside a `Sidebar`, the `Sidebar` might want the button to have a specific margin or a simplified border.

```css
/* Sidebar.css */
.sidebar-container .Button {
    /* The parent reaches into the child's scope */
    margin-bottom: 1rem;
    border-radius: 0;
}
```

This is safe because:
-   The dependency is explicit: `Sidebar` depends on `Button`.
-   The `Button` stays pure: it doesn't contain any "if I'm in a sidebar" logic.
-   The scope is limited: these overrides only apply when the `Button` is a descendant of `Sidebar`.

By leveraging native CSS nesting, FuseWire makes this architectural pattern easy to implement without any extra syntax or complex selectors.

