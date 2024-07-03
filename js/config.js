import { Component, ComponentElement } from "./component.js";
import { FuseWireConfigMissing, FuseWireError } from "./error.js";
import { ReactorModes } from "./reactor.js";

export class Config {
    /**
     * TODO: switch to a Builder pattern? Longer lib code, but better checks and devUX?
     * @param {*} config
     */
    constructor(config) {
        if (typeof(config) !== 'object') {
            throw new FuseWireError('invalid config object');
        }
        this.config = config;
        if (!this.config.serverUrl && !this.config.clientUrl) {
            throw new FuseWireConfigMissing('serverUrl|clientUrl');
        }
        if (!this.config.defaultReactorMode) {
            this.config.defaultReactorMode = ReactorModes.SSR;
        }
        if (!ReactorModes.hasOwnProperty(this.config.defaultReactorMode)) {
            throw new FuseWireConfigMissing('defaultReactorMode');
        }
        if (!this.config.window) {
            this.config.window = window;
        }
        if (!this.config.document) {
            this.config.document = this.config.window.document;
        }
        if (!this.config.jsonParser) {
            this.config.jsonParser = window.JSON;
        }
        if (!this.config.localStorage) {
            this.config.localStorage = this.config.window.localStorage;
        }
        if (!(this.config.localStorage instanceof Storage)) {
            throw new FuseWireError('Local Storage config does not implement the Storage interface');
        }
        if (!this.config.log) {
            this.config.log = console.log;
        }
        if (typeof(this.config.log) !== 'function') {
            throw new FuseWireError('Configuration error: log is not a function');
        }
        this.config.logEnabled = Boolean(this.config.logEnabled);
        this.config.nestCssWithComponentName = typeof(this.config.nestCssWithComponentName) === 'undefined' ? true : Boolean(this.config.nestCssWithComponentName);
        if (this.config.afterRender && typeof(this.config.afterRender) !== 'function') {
            throw new FuseWireError('Configuration error: afterRender is not a function');
        }
        if (!this.config.fusewirePath) {
            this.config.fusewirePath = this.getDocument().baseURI + 'fusewire';
        }
        if (!this.config.fusewireTags) {
            this.config.fusewireTags = ['((', '))'];
        }
    }

    /** @return {String} Path to the FuseWire endpoint for fetching components from */
    getServerUrl() {
        return this.config.serverUrl;
    }

    /** @return {String} Path to the FuseWire static directory for fetching client-only components */
    getClientUrl() {
        return this.config.clientUrl;
    }

    /** @return {String} FuseWire base URL */
    getFuseWirePath() {
        return this.config.fusewirePath;
    }

    /** @returns {Array<String>} Mustache tags to use */
    getTags() {
        return this.config.fusewireTags;
    }

    /** @return {Storage} */
    getLocalStorage() {
        return this.config.localStorage;
    }

    /** @return {String} One of ReactorModes */
    getDefaultReactorMode() {
        return this.config.defaultReactorMode;
    }

    /** @returns {Window} */
    getWindow() {
        return this.config.window;
    }

    /** @returns {Document} */
    getDocument() {
        return this.config.document;
    }

    /** @returns {JSON} */
    getJsonParser() {
        return this.config.jsonParser;
    }

    /** @returns {Boolean} */
    getUseShadowElement() {
        return Boolean(this.config.useShadowElement);
    }

    /** @return {Boolean} */
    getNestCssWithComponentName() {
        return this.config.nestCssWithComponentName;
    }

    getComponentId(componentName, componentId) {
        return componentName + (componentId ? `_${componentId}` : '');
    }

    /**
     * @param {Component} component
     * @param {ComponentElement} container
     */
    afterRender(component, container) {
        if (this.config.afterRender) {
            this.config.afterRender(component, container);
        }
    }

    log(message) {
        if (this.config.logEnabled) {
            this.config.log(message);
        }
    }
}
