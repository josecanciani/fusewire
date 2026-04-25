import { Component, Child } from './src/component.js';

declare module './src/component.js' {
    interface Component {
        [key: symbol]: any;
        [key: string]: any;
    }
    interface Child {
        [key: symbol]: any;
    }
}

declare module 'idiomorph';
