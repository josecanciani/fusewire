import { Component } from '/js/component.js';

export class Counter extends Component {
    /** @type {number} */
    count = 0;

    async init() {
        this.console.log('Counter created with initial count:', this.count);
    }

    afterRender() {
        // afterRender is called after the component is rendered (data changes and it's re-rendered)
        this.console.log('Counter rendered with count:', this.count);
    }

    increment() {
        this.count++;
        this.react();
    }

    decrement() {
        this.count--;
        this.react();
    }

    destroy() {
        this.console.log('Counter destroyed');
    }
}
