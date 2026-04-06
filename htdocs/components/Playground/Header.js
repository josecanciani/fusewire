import { Component } from '/js/component.js';

/**
 *
 */
export class Header extends Component {
    /** @type {string} */
    theme = 'light';

    /**
     * Toggle between light and dark theme and emit the change.
     */
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.react();
        this.emit('changeTheme', this.theme);
    }
}
