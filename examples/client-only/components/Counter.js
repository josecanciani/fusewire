import { Component } from '/js/component.js';

export class Counter extends Component {
    increment() {
        this.console.log('Incrementing counter');
        this.vars.count++;
        this.react();
    }

    decrement() {
        this.console.log('Decrementing counter');
        this.vars.count--;
        this.react();
    }

    async hydrate() {
        if (typeof this.vars.count !== 'number') {
            this.vars.count = 0;
        }
        this.console.log('Counter hydrated with count:', this.vars.count);
    }

    destroy() {
        this.console.log('Counter destroyed');
    }
}
