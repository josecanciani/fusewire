import { fetchComponents } from "./server.js";
import { Renderer } from "./renderer.js";
import { FuseWireError } from "./error.js";
import { Component, ComponentContainer, ComponentRune, ComponentShadowContainer } from "./component.js";
import { Config } from "./config.js";
import { InstanceDao } from "./instance.js";
import { Template, TemplateDao } from "./template.js";

/**
 *
 * @param {String} userMode One of ReactorModes
 * @param {Config} config
 * @returns {String}
 */
function getReactorMode(userMode, config) {
    const mode = userMode ? userMode : config.getDefaultReactorMode();
    if (typeof(ReactorModes[mode]) === 'undefined') {
        throw new FuseWireError('Invalid ReactorMode');
    }
    return mode;
}

export const ReactorModes = {
    /**
     * Client Side Rendering: we will use the available component template in the browser.
     * If there's no data / template, will use SERVER mode.
     */
    CSR: 'CSR',
    /**
     * Client Side Rendering without Server interaction. No server component, data downloaded directly from config.clientUrl
     */
    CSR_ONLY: 'CSR_ONLY',
    /**
     * Server mode: we will send the server variables to the server for process.
     * If another react is called while in transit, we will do a CSR first to quickly update UI too,
     * and when the server request is completed, we will dispatch a new server call with the last reaction vars.
     * Only when the last server request ends, and there's no pending requests, we will update client vars and call hydrate().
     */
    SERVER: 'SERVER',
    /**
     * Server Wait mode: it works like the SERVER mode, but the client will not be re-rendered until there's a response.
     */
    SERVER_WAIT: 'SERVER_WAIT',
    /**
     * Server Side Rendering:
     * We will send the server variables and request the full rendered component (HTML-over-the-wire)
     */
    SSR: 'SSR'
}

export class Reactor {
    /**
     * @param {Config} config
     * @param {InstanceDao} instanceDao Not really needed expect for testing
     */
    constructor(config, instanceDao) {
        if (!(config instanceof Config)) {
            throw new FuseWireError('A config object is required to initialize FuseWire');
        }
        this.config = config;
        const window = this.config.getWindow();
        if (typeof(window.FuseWire) === 'undefined') {
            window.FuseWire = {
                instances: {}
            };
            window.customElements.define('fusewire-container', ComponentContainer);
            window.customElements.define('fusewire-shadow-container', ComponentShadowContainer);
            window.customElements.define('fusewire-rune', ComponentRune);
        }
        this.id = 'a' + (Math.random() + 1).toString(36).substring(2);
        window.FuseWire.instances[this.id] = this;
        this.instanceDao = instanceDao;
        this.inFlight = {};
    }

    /** @returns {String} Unique Reactor process ID */
    getId() {
        return this.id;
    }

    /**
     * Entry point for the reactor. Call with a DOM element where we are going to work in.
     * @param {HTMLBodyElement} container
     * @param {String} component
     * @param {String} id
     * @param {*} vars Optional list, they will be loaded from the server when using SSR
     * @param {String} mode One of ReactorModes
     */
    async start(container, component, id, vars, mode) {
        const defaultContent = '...';
        const componentId = this.config.getComponentId(component, id);
        this.reactorRoot = this.config.getUseShadowElement() ?
            new ComponentShadowContainer(componentId, defaultContent) :
            new ComponentContainer(componentId, defaultContent);
        container.appendChild(this.reactorRoot);
        if (!this.instanceDao) {
            this.instanceDao = new InstanceDao(
                this.config, this,
                new TemplateDao(this.config, this),
                new Renderer(this.config, this.reactorRoot)
            );
        }
        await this._run(componentId, component, id, getReactorMode(mode, this.config), false, vars);
    }

    /** @returns {ComponentContainer} */
    getRoot() {
        return this.reactorRoot;
    }

    /**
     * @param {Component} component
     * @param {String} mode
     */
    async react(component, mode) {
        // hydration should have set the fuseWireComponentId as a component var
        const componentId = component.fuseWireComponentId;
        const {name, id} = this.instanceDao.getComponentNameAndId(componentId);
        let reactorMode = getReactorMode(mode, this.config);
        this.config.log(`reactor.js:react:${componentId} starting reaction in mode ${reactorMode}`);
        if (typeof(this.inFlight[componentId]) !== 'undefined' && reactorMode === ReactorModes.SERVER_WAIT) {
            this.inFlight[componentId]++;
            this.config.log(`reactor.js:react:${componentId}: found in flight requests, aborting this ${ReactorModes.SERVER_WAIT} request`);
            return;
        }
        if (reactorMode === ReactorModes.SERVER) {
            // we first do a quick CSR pass
            await this.react(component, ReactorModes.CSR);
        }
        if (typeof(this.inFlight[componentId]) === 'undefined') {
            this.inFlight[componentId] = 0;
        }
        this.inFlight[componentId]++;
        const requestSerial = this.inFlight[componentId];
        try {
            if (requestSerial > 1 && reactorMode !== ReactorModes.CSR) {
                // TODO: SSR support
                this.config.log(`reactor.js:react:${componentId}: found in flight requests, switching to CSR mode`);
                reactorMode = ReactorModes.CSR;
            }
            await this._run(componentId, name, id, reactorMode);
        } finally {
            // Any server request, that had an interaction during the server fetch, must be respawn so server can get the latest data
            const respawn = reactorMode !== ReactorModes.CSR && this.inFlight[componentId] > 1;
            if (requestSerial === 1) {
                delete this.inFlight[componentId];
                if (respawn) {
                    await this.react(component, mode);
                }
            }
        }
    }

    /**
     * @returns {Component}
     * @throws {FuseWireComponentNotFound}
     */
    getInstance(id) {
        return this.instanceDao.getInstance(id);
    }

    /**
     * Draw a Component inside an document element
     * @param {String} componentId
     * @param {String} component
     * @param {String} id
     * @param {String} mode One of ReactorModes
     * @param {*} initVars Optional, when starting a new instance from the client and you want to use specific vars
     */
    async _run(componentId, component, id, mode, initVars) {
        let isNew = !this.instanceDao.exists(componentId);
        // TODO: recursive convert vars to components??
        let vars = !isNew ? this.instanceDao.extractVars(componentId) : initVars;
        let version = this.instanceDao.getVersion(component, id);
        if (mode !== ReactorModes.CSR && mode !== ReactorModes.CSR_ONLY) {
            const response = await this._fetch(mode, component, id, vars);
            vars = response.vars;
            version = response.version;
            id = response.id;
            if (isNew && this.instanceDao.exists(componentId)) {
                this.config.log(`reactor.js:_run:${componentId}: skipping, instance has been created during our fetch`);
                return;
            }
        }
        // TODO: what happens if version changes?
        const template = await this.instanceDao.templateDao.getOrFetch(component, version, mode);
        if (isNew) {
            await this.instanceDao.create(template, vars, id, version);
        } else if (this.inFlight[componentId] === 1) {
            // debounce optimization, no need to call update multiple times, thus avoiding overwritting new client vars with old server ones
            await this.instanceDao.update(componentId, vars, version);
        }
        const container = this.reactorRoot instanceof ComponentShadowContainer ?
            this.reactorRoot.shadowRoot.getElementById(`fusewire_${componentId}`) :
            this.config.getDocument().getElementById(`fusewire_${componentId}`);
        this.instanceDao.render(container, componentId, isNew, template);
    }

    /**
     * @param {String} mode
     * @param {String} component
     * @param {String} id
     * @param {*} vars
     * @param {Template} template
     * @returns {*} Component response object
     */
    async _fetch(mode, component, id, vars) {
        const components = [{
            'fusewire-type': 'component',
            mode: mode,
            component: component,
            id: id || '',
            vars: this.instanceDao.encodeVars(vars, mode)
        }];
        const templates = [{
            component: component,
            version: this.instanceDao.templateDao.getVersion(component)
        }];
        const response = await fetchComponents(this.config, components, templates);
        for (const templateResponse of response.templates) {
            this.instanceDao.templateDao.setFromTemplateResponse(templateResponse);
        }
        return response.components[0];
    }
}
