export class Component {
    /**
     * @param {String} mode One of ReactorModes
     */
    async react(mode) {
        await this.FuseWireReactor.react(this, mode);
    }

    /**
     * This method will be called when server variables have changed (or we are creating the component for the first time),
     * and before a rendering to the DOM.
     */
    async hydrate() {
        // optional implementation
    }

    /**
     * This method is called after server vars have been updated. It's similar to hydrate(), but notice
     * it is not async. This is because we can't allow for a race conditions: variables shoudn't be modified
     * during the server update process.
     * @param {*} oldVars Only the variables that did changed, with their prior value (FuseWire already modified them for you)
     */
    update(oldVars) {
        // optional implementation
    }

    /**
     * In case you want to do custom cleaning, this is called when removing an instance, after taking it outside the DOM.
     */
    destroy() {
        // optional implementation
    }
}

export class ComponentElement extends HTMLElement {
    /** @param {String} name */
    addCssClass(name) {
        this.classList.add(name);
    }

    /** @param {String} name */
    removeCssClass(name) {
        this.classList.remove(name);
    }

    /** @param {String} content */
    replaceHtmlContent(content) {
        this.innerHTML = content;
    }
}

export class ComponentContainer extends ComponentElement {
    /**
     * @param {String} componentId
     * @param {String} defaultContent
     * @param {ComponentShadowContainer} parentShadow Optional, if this is the shadow element of a Shadow Container
     */
    constructor(componentId, defaultContent, parentShadow) {
        super();
        if (componentId) {
            // if the element is created by html, no arguments will be used, so these are already there.
            this.setAttribute('id', `fusewire_${componentId}`);
            this.setAttribute('fusewire-component-id', `${componentId}`);
        }
        this.parentShadow = parentShadow;
        this.innerHTML = defaultContent || '...';
        this.classList.add('fusewire_container', this.getClassName());
    }

    getClassName() {
        return this.getAttribute('id');
    }

    /**
     * @param {string} componentId
     * @param {string} name Optional, find a specific rune inside the component
     * @returns {Array<ComponentRune>}
     */
    getRunes(componentId, name) {
        return this.querySelectorAll(`fusewire-rune[fusewire-component="${componentId}"]` + (name ? `[fusewire-name="${name}"]` : ''));
    }

    /**
     * @param {string} componentId
     * @returns {ComponentContainer}
     */
    getSubComponent(componentId) {
        return this.querySelectorAll(`fusewire-container[fusewire-component-id="${componentId}"]`).item(0);
    }

    /** @param {String} name */
    addCssClass(name) {
        this.classList.add(name);
    }

    /** @param {String} name */
    removeCssClass(name) {
        this.classList.remove(name);
    }

    /** @param {String} content */
    replaceHtmlContent(content) {
        this.innerHTML = content;
    }
}

export class ComponentShadowContainer extends ComponentContainer {
    constructor(componentId, defaultContent) {
        super(componentId, defaultContent);
        this.component = new ComponentContainer(componentId, defaultContent || '...', this);
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.appendChild(this.component);
    }

    /**
     * @param {string} componentId
     * @param {string} name
     * @returns {Array<ComponentRune>}
     */
    getRunes(componentId, name) {
        return this.component.querySelectorAll(`fusewire-rune[fusewire-component="${componentId}"]` + (name ? `[fusewire-name="${name}"]` : ''));
    }

    /** @param {String} name */
    addCssClass(name) {
        this.component.addCssClass(name);
    }

    /** @param {String} name */
    removeCssClass(name) {
        this.component.removeCssClass(name);
    }

    /** @param {String} content */
    replaceHtmlContent(content) {
        this.component.replaceHtmlContent(content);
    }
}

export class ComponentRune extends ComponentElement {
    replaceHtmlContent(content) {
        this.innerHTML = content;
    }
}
