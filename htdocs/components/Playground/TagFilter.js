import { Component } from '/js/component.js';

/**
 *
 */
export class TagFilter extends Component {
    /** @type {Array.<{name: string, activeClass: string}>} */
    tags = [];

    /**
     * Toggle a tag filter on or off. Emits 'change' with the array of
     * currently active tag names (empty array means show all).
     * @param {string} name - Tag name to toggle
     */
    toggleTag(name) {
        const tag = this.tags.find((t) => t.name === name);
        tag.activeClass = tag.activeClass === 'active' ? '' : 'active';

        this.react();
        this.emit(
            'change',
            this.tags.filter((t) => t.activeClass === 'active').map((t) => t.name),
        );
    }
}
