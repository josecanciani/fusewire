
import mustache from "https://cdnjs.cloudflare.com/ajax/libs/mustache.js/4.2.0/mustache.min.js"
import { ComponentContainer, ComponentRune, ComponentShadowContainer } from "./component.js";
import { Config } from "./config.js";
import { Template } from "./template.js";

export class ContainerPlaceHolder {
    /** @param {String} componentId */
    constructor(componentId) {
        this.componentId = componentId;
    }

    /** @returns {String} */
    getComponentId() {
        return this.componentId;
    }

    /** @returns {String} */
    getDefaultContent() {
        // TODO: for lazy loading, we may want to improve this later
        return '...';
    }
}

/**
 * @param {String} template
 * @param {*} vars
 * @return {String}
 */
function render(template, componentId, vars, constants) {
    const runes = {};
    if (componentId) {
        for (const key in vars) {
            // at this point we don't know which vars are runes, so we just assume all are, after all, if a var does not start with $, it won't be used
            if (vars[key] instanceof ContainerPlaceHolder) {
                const placeHolder = vars[key];
                runes[`$${key}`] = `<fusewire-container id="fusewire_${placeHolder.getComponentId()}" fusewire-component-id="${placeHolder.getComponentId()}">${mustache.escape(placeHolder.getDefaultContent())}</fusewire-container>`;
                delete vars[key];
            } else {
                runes[`$${key}`] = `<fusewire-rune fusewire-name="${key}" fusewire-component="${componentId}">${mustache.escape(vars[key])}</fusewire-rune>`;
            }
        }
    }
    return mustache.render(
        template,
        {
            ...vars,
            ...runes,
            ...constants
        },
        undefined,
        {tags: constants.fuseWireTags}
    );
}

/**
 * @param {Config} config
 * @param {ComponentContainer} reactorRoot
 * @param {String} componentId
 * @param {String} cssTemplate
 */
function addStyleObjectIfNeeded(config, reactorRoot, componentId, cssTemplate, containerClassName, constants) {
    const styleId = `fuseWire_style_${componentId}`;
    if (cssTemplate === '' || (reactorRoot instanceof ComponentShadowContainer ? reactorRoot.shadowRoot.getElementById(styleId) : config.getDocument().getElementById(styleId))) {
        return;
    }
    config.log(`render.js:render:${componentId} adding CSS styles to root element`);
    const style = config.getDocument().createElement('style');
    style.id = styleId;
    style.textContent =
        (config.getNestCssWithComponentName() ? `.${containerClassName} {\n` : '') +
        render(cssTemplate, componentId, {}, constants) +
        (config.getNestCssWithComponentName() ? '\n}' : '');
    if (reactorRoot instanceof ComponentShadowContainer) {
        reactorRoot.shadowRoot.appendChild(style);
    } else {
        config.getDocument().head.appendChild(style);
    }
}

export class Renderer {
    /**
     * @param {Config} config
     * @param {ComponentContainer} reactorRoot
     */
    constructor(config, reactorRoot) {
        this.config = config;
        this.reactorRoot = reactorRoot;
    }

    /**
     * @param {ComponentContainer} container
     * @param {String} componentId
     * @param {Template} template
     * @param {*} vars
     * @param {*} constants
     */
    render(container, componentId, template, vars, constants) {
        addStyleObjectIfNeeded(this.config, this.reactorRoot, componentId, template.getCssCode(), container.getClassName(), constants);
        this.config.log(`render.js:render:${componentId} HTML rendering now`);
        container.replaceHtmlContent(
            render(template.getHtmlCode(), componentId, vars, constants)
        );
    }

    /**
     * @param {ComponentRune} container
     * @param {*} value
     */
    renderRune(rune, value) {
        rune.replaceHtmlContent(mustache.escape(value));
    }

    /**
     * @param {String} template
     * @param {*} vars
     * @return {String}
     */
    applyVarsToJs(template, constants) {
        return render(
            template
                .replaceAll(' from "./', ' from "(({fuseWirePath}))/')
                .replaceAll(" from './", " from '(({fuseWirePath}))/"),
            null,
            {},
            constants
        );
    }
}
