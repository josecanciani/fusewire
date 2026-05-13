import { Component } from '../../js/component.js';

/**
 *
 */
export class Sidebar extends Component {
    /**
     * List of available demos.
     * @type {Array.<{name: string, title: string, description: string, tags: string[]}>}
     */
    demos = [];
    /**
     * List of files for the current demo.
     * @type {Array.<{id: string, label: string, activeClass: string}>}
     */
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
