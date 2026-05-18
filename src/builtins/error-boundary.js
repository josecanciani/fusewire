import { Component } from '../component.js';

/**
 * Built-in error boundary component.
 * Catches fw-error events from a target child and renders a fallback instead.
 * Acts as a routing pass-through so the router can reach routed children.
 */
export class ErrorBoundary extends Component {
    static componentName = 'FuseWire/ErrorBoundary';

    /**
     * The currently rendered child (switches from target to fallback on error).
     * @type {import('../component.js').Child|Component}
     */
    child;

    /**
     * The primary child component being protected.
     * @type {import('../component.js').Child}
     */
    targetChild;

    /**
     * The component shown when targetChild emits fw-error.
     * @type {import('../component.js').Child}
     */
    fallbackChild;

    /**
     * Wire fw-error listener: on failure, update the fallback vars and swap child to fallback.
     */
    async init() {
        if (!this.child) {
            this.child = this.targetChild;
        }

        this.targetChild.on('fw-error', (ctx) => {
            this.fallbackChild.update({
                errorMessage: ctx.error.message,
                failedComponent: ctx.failedComponent,
            });
            this.update({
                child: this.fallbackChild,
            }).then(() => this.emit('error', ctx));
            if (ctx.preventDefault) ctx.preventDefault();
            return false; // Prevent further bubbling
        });
    }

    /**
     * Pass-through for routing — no URL segment of its own, but the router
     * walks through to reach routed children (e.g. the wrapped component).
     * @returns {Object<string, string>} Empty object (structural pass-through)
     */
    routeState() {
        return {};
    }
}
