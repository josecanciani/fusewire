import { Component } from '../component.js';
import { EVENTS } from '../symbols.js';

/**
 * Built-in lazy-loading wrapper component.
 * Renders a placeholder until the real child is ready, then swaps it in.
 */
export class Lazy extends Component {
    static componentName = 'FuseWire/Lazy';

    /**
     * The currently rendered child (switches from placeholder to lazyChild).
     * @type {import('../component.js').Child}
     */
    child;

    /**
     * The heavy child component being loaded in the background.
     * @type {import('../component.js').Child}
     */
    lazyChild;

    /**
     * The temporary placeholder shown while lazyChild is loading.
     * @type {import('../component.js').Child}
     */
    placeholderChild;

    /**
     * Show placeholder immediately; swap in the real child once ready or handle load errors.
     */
    async init() {
        this.child = this.placeholderChild;
        this.lazyChild
            .whenReady()
            .then(() => {
                this.update({ child: this.lazyChild });
            })
            .catch((err) => {
                this.console.error(
                    `Lazy load failed for ${this.lazyChild.componentName}: ${err.message}`,
                );
                this.lazyChild._creationError = err;
                const handled = this.lazyChild._emitBuffered('fw-error', {
                    error: err,
                    failedComponent: this.lazyChild.componentName,
                });
                if (!handled) {
                    // Bubble the error up to the Lazy component's parent
                    const parentHandled = this[EVENTS]
                        ? this[EVENTS].emitBroadcast('fw-error', {
                              error: err,
                              failedComponent: this.lazyChild.componentName,
                          }).stopped
                        : false;
                    if (!parentHandled) {
                        // Unhandled error in background load propagates globally
                        throw err;
                    }
                }
            });
    }
}
