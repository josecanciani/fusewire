import { Component } from '/js/component.js';

export class Sidebar extends Component {
    /** @type {Array.<object>} */
    demos = [];
    /** @type {Array.<object>} */
    demoFiles = [];

    /**
     * Select a demo by name.
     * @param {string} name - Demo name
     */
    selectDemo(name) {
        this.emit('selectDemo', name);
    }

    /**
     * Open a file tab.
     * @param {string} id - File tab id
     */
    openFile(id) {
        this.emit('openFile', id);
    }

    /**
     * Navigate back to the demo list.
     */
    back() {
        this.emit('back');
    }

    /**
     * Highlight a file in the sidebar file list.
     * @param {string|null} id - File id to highlight, or null to clear all
     */
    highlightFile(id) {
        this.demoFiles.forEach((f) => {
            f.activeClass = f.id === id ? 'active' : '';
        });
        this.react();
    }
}
