/**
 * This file provides utilities for Reactor to fetch components from the server
 * TODO: worker, offline mode support
 */
import { Config } from "./config.js";
import { FuseWireError } from "./error.js";
import { ReactorModes } from "./reactor.js";

export class FuseWireServerError extends FuseWireError {
    constructor(message, statusCode, opts) {
        super(message, opts);
        this.name = 'FuseWireServerError';
        this.statusCode = statusCode;
    }
}

/**
 * @param {Config} config
 * @param {Array<String>} files files to download
 * @returns {Promise<Object>}
 */
async function fetchFiles(config, files) {
    throw new Error('CRS_ONLY not implemented yet');
}

/**
 * @param {Config} config
 * @param {String} method
 * @param {FormData} formData
 * @returns {Promise<Object>}
 */
async function fetchJson(config, method, formData) {
    try {
        const response = await fetch(config.getServerUrl(), { method: method, body: formData});
        if (!response.ok) {
            throw new FuseWireServerError(`FuseWire Server Error, fetch() error: ${response.statusText}`, response.status);
        }
        if (response.status < 200 || response.status > 300) {
            throw new new FuseWireServerError(`FuseWire Server Error, non 200 status code: ${response.status}`, response.status);
        }
        const data = await response.json();
        if (!data['fusewire-type'] || data['fusewire-type'] !== 'response') {
            throw new FuseWireServerError(`Error detected on the server: invalid response type`, response.status);
        }
        return data;
    } catch (err) {
        if (err instanceof FuseWireServerError) {
            throw err;
        }
        throw new FuseWireServerError(`FuseWire Server Error: ${err.message}`, null, { cause: err });
    }
}

/**
 * Fetches component states from the server, and will return templates as needed
 * @param {Config} config
 * @param {Array<Object>} templates Component templates to fetch, an array of objects {component: String, version: String}
 * @param {Array<Object>} templates Component templates to fetch, an array of objects {component: String, version: String}
 * @returns {Object} JSON from the server, {components: {Array<Object>}, templates: {Array<Object>}}
 * @throws {FuseWireError} Error when response was not what we expected
 */
export async function fetchComponents(config, components, templates) {
    config.log(`server.js:fetchComponent: fetching ${components.length} components and ${templates.length} templates...`);
    const formData = new FormData();
    formData.append('fusewire_components', config.getJsonParser().stringify(components));
    formData.append('fusewire_templates', config.getJsonParser().stringify(templates));
    const response = await fetchJson(config, 'POST', formData);
    return {
        components: response.components,
        templates: response.templates
    };
}

/**
 * Fetches a single component template from the server
 *
 * @param {Config} config
 * @param {Array<Object>} templates Component templates to fetch, an array of objects {component: String, version: String}
 * @returns {Promise<Array>} JSON objects from the server
 * @throws {FuseWireError} Error when response was not what we expected
 */
export async function fetchTemplates(config, templates, mode) {
    if (mode === ReactorModes.CSR_ONLY) {
        config.log(`server.js:fetchTemplates: fetching ${templates.length} templates from HTTP files...`);
        const response = await fetchFiles(config, templates);
        return response.templates;
    } else {
        config.log(`server.js:fetchTemplates: fetching ${templates.length} templates from Reactor JSON server...`);
        const formData = new FormData();
        formData.append('fusewire_templates', config.getJsonParser().stringify(templates));
        const response = await fetchJson(config, 'POST', formData);
        if (!response || typeof(response.templates) === 'undefined' || !Array.isArray(response.templates)) {
            throw new FuseWireServerError(`Error detected on the server: no templates data found on response`);
        }
        return response.templates;
    }
}
