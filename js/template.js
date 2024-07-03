import { Config } from "./config.js";
import { FuseWireTemplateNotFound } from "./error.js";
import { fetchTemplates } from "./server.js";

/** @param {String} htmlCode */
function fixRunes(htmlCode) {
    return htmlCode.replace(
        new RegExp('(\\(\\(\\s*\\$(\\w+)\\s*\\)\\))', 'mg'),
        `(({$$$2}))`
    );
};

export class Template {
    /** @param {*} json */
    static fromJSON(json) {
        const component = new Template(json.component, json.jsCode, json.cssCode, json.htmlCode, json.version);
        component.lastUpdated = json.lastUpdated;
        return component;
    }

    /**
     * @param {String} component
     * @param {Number} lastUpdated milliseconds since epoch
     * @param {String} jsCode
     * @param {String} cssCode
     * @param {String} htmlCode
     * @param {String} version
     */
    constructor(component, jsCode, cssCode, htmlCode, version) {
        this.lastUpdated = Date.now();
        this.component = component;
        this.jsCode = jsCode;
        this.cssCode = cssCode;
        this.htmlCode = htmlCode;
        this.version = version;
    }

    /** @returns {String} */
    getComponent() {
        return this.component;
    }

    /** @returns {String} */
    getJsCode() {
        return this.jsCode;
    }

    /** @returns {String} */
    getCssCode() {
        return this.cssCode;
    }

    /** @returns {String} */
    getHtmlCode() {
        return this.htmlCode;
    }

    /** @returns {String} */
    getVersion() {
        return this.version;
    }

    toJSON() {
        return {
            'fusewire-type': 'template',
            component: this.component,
            lastUpdated: this.lastUpdated,
            jsCode: this.jsCode,
            cssCode: this.cssCode,
            htmlCode: this.htmlCode,
            version: this.version
        }
    }
}

/** Keep track of all component templates in the application */
export class TemplateDao {
    /**
     * @param {Config} config
     * @param {Reactor} reactor
     */
    constructor(config, reactor) {
        this.config = config;
        this.reactor = reactor;
        this.versions = this.config.getJsonParser().parse(this.config.getLocalStorage().getItem('fusewire_template_versions') || '{}');
    }

    /**
     * @param {String} name
     * @returns {String} Empty string when component is not locally stored
     */
    getVersion(name) {
        const template = this.config.getJsonParser().parse(this.config.getLocalStorage().getItem(`fusewire_template_${name}`) || '{}');
        return template.version || '';
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    exists(name) {
        return this.config.getLocalStorage().hasOwnProperty(`fusewire_template_${name}`);
    }

    /**
     * If the template is not on our cache, we will fetch, so this is an async call
     * @param {String} name  component name
     * @param {String} version  component version, if we have one (will fetch if defined and does not match our stored version)
     * @returns {Promise<Template>} template object
     */
    async getOrFetch(name, version, mode) {
        const localStorageTemplateKey = `fusewire_template_${name}`;
        const db = this.config.getLocalStorage();
        const storedTemplate = Template.fromJSON(this.config.getJsonParser().parse(db.getItem(localStorageTemplateKey) || '{}'));
        if (typeof(version) !== 'undefined' && this.versions.hasOwnProperty(name) && version === this.versions[name]) {
            // Optimization: just return the stored version, but beware of client cleaning the localStorage
            if (storedTemplate.getVersion() && storedTemplate.getVersion() === version) {
                this.config.log(`template.js:getOrFetch:${name}: template found locally, skipping server fetch`);
                return storedTemplate;
            }
            //  race conditions/errors: clean so we get the last one from server
            version = '';
        }
        const templateResponses = await fetchTemplates(this.config, [{component: name, version: version}], '');
        if (!templateResponses.length) {
            return storedTemplate;
        }
        return this.setFromTemplateResponse(templateResponses[0]);
    }

    /**
     *
     * @returns {Template} template
     */
    setFromTemplateResponse(templateResponse) {
        const db = this.config.getLocalStorage();
        const localStorageTemplateKey = `fusewire_template_${templateResponse.component}`;
        const template = new Template(
            templateResponse.component,
            templateResponse.jsCode,
            templateResponse.cssCode,
            fixRunes(templateResponse.htmlCode),
            templateResponse.version
        );
        db.setItem(localStorageTemplateKey, this.config.getJsonParser().stringify(template));
        this.versions[templateResponse.component] = template.getVersion();
        if (typeof(this._setTimeOut) === 'undefined') {
            this._setTimeOut = setTimeout(() => {
                db.setItem('fusewire_template_versions', this.config.getJsonParser().stringify(this.versions));
                delete this._setTimeOut;
            });
        }
        return template;
    }

    /**
     * @return {Template}
     * @throws {FuseWireTemplateNotFound}
     */
    get(name) {
        const db = this.config.getLocalStorage();
        const templateJson = db.getItem(`fusewire_template_${name}`);
        if (templateJson === null) {
            throw new FuseWireTemplateNotFound(name);
        }
        return Template.fromJSON(this.config.getJsonParser().parse(templateJson));
    }

    /**
     * This method will recursively capture all components, verify if we have their templates, and fetch them when needed
     * @param {Array<Object>} componentResponses
     */
    async fetchFromComponentResponses(componentResponses) {
        const templates = [];
        for (const response of componentResponses) {

        }
    }
}
