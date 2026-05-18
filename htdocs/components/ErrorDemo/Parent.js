import { Component } from '../../js/component.js';

/**
 * Demo parent component that mounts four error-bounded child components, one per lifecycle hook.
 */
export class Parent extends Component {
    /**
     * Error boundary for the init phase failure.
     * @type {import('../../js/builtins/error-boundary.js').ErrorBoundary|null}
     */
    initFail = null;
    /**
     * Retry count for the init phase failure.
     * @type {number}
     */
    initTries = 1;
    /**
     * Error boundary for the hydrate phase failure.
     * @type {import('../../js/builtins/error-boundary.js').ErrorBoundary|null}
     */
    hydrateFail = null;
    /**
     * Retry count for the hydrate phase failure.
     * @type {number}
     */
    hydrateTries = 1;
    /**
     * Error boundary for the render phase failure.
     * @type {import('../../js/builtins/error-boundary.js').ErrorBoundary|null}
     */
    renderFail = null;
    /**
     * Retry count for the render phase failure.
     * @type {number}
     */
    renderTries = 1;
    /**
     * Error boundary for the afterRender phase failure.
     * @type {import('../../js/builtins/error-boundary.js').ErrorBoundary|null}
     */
    afterRenderFail = null;
    /**
     * Retry count for the afterRender phase failure.
     * @type {number}
     */
    afterRenderTries = 1;

    /**
     * Compute if the test uses eager child creation.
     * @type {boolean}
     * Whether to show the load count for the init failure demo.
     */
    get $showInitLoadCount() {
        return this.initTries > 1;
    }

    /**
     * Whether to show the load count for the hydrate failure demo.
     * @type {boolean}
     */
    get $showHydrateLoadCount() {
        return this.hydrateTries > 1;
    }

    /**
     * Whether to show the load count for the render failure demo.
     * @type {boolean}
     */
    get $showRenderLoadCount() {
        return this.renderTries > 1;
    }

    /**
     * Whether to show the load count for the afterRender failure demo.
     * @type {boolean}
     */
    get $showAfterRenderLoadCount() {
        return this.afterRenderTries > 1;
    }

    /**
     * Create all four error-bounded children and wire their error listeners.
     */
    async init() {
        this.initFail = this.createErrorBoundedChild(
            this.createChild('ErrorDemo/FailComponent', 'init'),
            'ErrorDemo/Fallback',
        );
        this.initFail.on('error', (ctx) => {
            this.console.error(ctx.error);
        });

        this.hydrateFail = this.createErrorBoundedChild(
            this.createChild('ErrorDemo/FailComponent', 'hydrate'),
            'ErrorDemo/Fallback',
        );
        this.hydrateFail.on('error', (ctx) => {
            this.console.error(ctx.error);
        });

        this.renderFail = this.createErrorBoundedChild(
            this.createChild('ErrorDemo/FailComponent', 'render'),
            'ErrorDemo/Fallback',
        );
        this.renderFail.on('error', (ctx) => {
            this.console.error(ctx.error);
        });

        this.afterRenderFail = this.createErrorBoundedChild(
            this.createChild('ErrorDemo/FailComponent', 'afterRender'),
            'ErrorDemo/Fallback',
        );
        this.afterRenderFail.on('error', (ctx) => {
            this.console.error(ctx.error);
        });
    }

    /**
     * Recreates the demo child component for a specific lifecycle hook
     * @param {string} stage - The specific component id signifying the lifecycle hook
     */
    retry(stage) {
        let tries;
        switch (stage) {
            case 'init':
                tries = ++this.initTries;
                break;
            case 'hydrate':
                tries = ++this.hydrateTries;
                break;
            case 'render':
                tries = ++this.renderTries;
                break;
            case 'afterRender':
                tries = ++this.afterRenderTries;
                break;
        }
        const boundary =
            /** @type {import('../../js/builtins/error-boundary.js').ErrorBoundary} */ (
                this.createErrorBoundedChild(
                    this.createChild('ErrorDemo/FailComponent', `${stage}-${Date.now()}`),
                    this.createChild('ErrorDemo/Fallback', `fallback-${stage}-${Date.now()}`, {
                        tries,
                    }),
                )
            );
        boundary.on('error', (ctx) => {
            this.console.error(ctx.error);
        });
        switch (stage) {
            case 'init':
                this.update({ initFail: boundary, initTries: this.initTries });
                break;
            case 'hydrate':
                this.update({
                    hydrateFail: boundary,
                    hydrateTries: this.hydrateTries,
                });
                break;
            case 'render':
                this.update({
                    renderFail: boundary,
                    renderTries: this.renderTries,
                });
                break;
            case 'afterRender':
                this.update({
                    afterRenderFail: boundary,
                    afterRenderTries: this.afterRenderTries,
                });
                break;
        }
    }
}
