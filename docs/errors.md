# Error Handling in FuseWire

FuseWire provides a robust, predictable system for handling component errors. Instead of crashing the entire application, errors are scoped and can be handled gracefully by parent components.

## Error Bubbling

When a component fails to initialize (e.g., its `init()` method throws an error, or a template fails to load), the error **bubbles up** the component tree.

1. The failed component stops rendering.
2. The framework emits an `fw-error` event on the component's reference (the `Child` object).
3. If the parent component has a listener for `fw-error` that stops propagation (by returning `false`), the error is considered handled. The parent continues to render, and the failed component's mount point remains empty.
4. If the parent does *not* handle the error (or if there's no listener), the parent's creation also fails, and the error bubbles up to the grandparent.
5. This continues until the error reaches the root of the application, resulting in a global unhandled promise rejection if uncaught.

## `fw-error` Event

You can listen for errors on a child component using the standard event listener syntax:

```javascript
export class MyParent extends Component {
    async init() {
        this.myChild = this.createChild('HeavyComponent');

        // Listen for errors on the child
        this.myChild.on('fw-error', (errorContext) => {
            this.console.error('Child failed:', errorContext.error);
            // Return false to stop propagation and prevent the parent from crashing
            return false;
        });
    }
}
```

The `errorContext` object contains:
- `error`: The actual `Error` object that was thrown.
- `failedComponent`: The name of the component that failed (e.g., `"HeavyComponent"`).

## Fallback Components (Error Boundaries)

Instead of manually listening to `fw-error`, you can wrap any child component with an **Error Boundary** by using `createErrorBoundedChild`. If the child fails to load or render, the framework will catch the error natively and automatically render the fallback component in its place.

```javascript
this.myChild = this.createErrorBoundedChild(
    this.createChild('HeavyComponent'),
    'Common/ErrorCard'
);
```

When a fallback is rendered:
1. The `ErrorBoundary` catches the `fw-error` event from its target child.
2. The boundary dynamically swaps its template to render your fallback component.
3. The fallback component is passed two variables automatically: `errorMessage` and `failedComponent`.
4. The broken target child is natively cleaned up by the engine.

Example fallback component (`Common/ErrorCard.html`):
```html
<div class="error-card">
    Failed to load ((failedComponent)): ((errorMessage))
</div>
```

## Lazy Components and Errors

`createLazyChild` naturally composes with `createErrorBoundedChild` if you want to provide a fallback upon failure. You should wrap the failing component inside the boundary before making it lazy:

```javascript
// The Lazy component will show the Skeleton placeholder while loading.
// If HeavyComponent fails, the ErrorBoundary will catch it and swap to ErrorCard.
this.lazyWidget = this.createLazyChild(
    this.createErrorBoundedChild(
        this.createChild('HeavyComponent'),
        'Common/ErrorCard'
    ),
    this.createChild('Skeleton')
);
```

If a lazy component fails and *no* boundary is configured, the error bubbles up through the `fw-error` event like any other component failure. Use `fw-error` event listeners if you wish to handle it conditionally natively.
