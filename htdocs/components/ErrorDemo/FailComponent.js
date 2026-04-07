import { Component } from '/js/component.js';

/**
 * Demo component that intentionally throws errors in different lifecycle hooks based on its component ID prefix.
 */
export class FailComponent extends Component {
    /** @type {string|object} */
    badVar = 'You should not be seeing this message, as this Component is meant to fail.';

    /**
     * Throw an error during init if the component ID starts with 'init'; set up the bad render var if it starts with 'render'.
     */
    async init() {
        const id = this.componentId;

        if (id.startsWith('init')) {
            throw new Error('This error was thrown intentionally inside init()');
        }

        if (id.startsWith('render')) {
            this.badVar = {
                /**
                 * Formatter for error message when object stringifies.
                 * @returns {string} Triggers intentional error
                 */
                toString() {
                    throw new Error(
                        'This error was thrown intentionally during template rendering (via stringification)',
                    );
                },
            };
        }
    }

    /**
     * Throw an error during hydrate if the component ID starts with 'hydrate'.
     */
    hydrate() {
        if (this.componentId.startsWith('hydrate')) {
            throw new Error('This error was thrown intentionally inside hydrate()');
        }
    }

    /**
     * Throw an error during afterRender if the component ID starts with 'afterRender'.
     */
    afterRender() {
        if (this.componentId.startsWith('afterRender')) {
            throw new Error('This error was thrown intentionally inside afterRender()');
        }
    }
}
