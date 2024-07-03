import { Component } from "./component.js";
import { Config } from "./config.js";
import { FuseWireComponentNotFound, FuseWireError } from "./error.js";
import { Reactor } from "./reactor.js";
import { Renderer, ContainerPlaceHolder } from "./renderer.js";
import { Template, TemplateDao } from "./template.js";

/**
 * @param {String} string
 * @returns {String}
 */
function escapeRegexChars(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {Config} config
 * @param {Component} component
 * @return {*} a list of constants
 */
function getConstants(config, component) {
    return {
        // we could have per-component settings in the future
        fuseWireTags: config.getTags(),
        fuseWirePath: config.getFuseWirePath(),
        fuseWireComponent: component
    }
}

/**
 * @param {Config} config
 * @param {*} vars
 * @returns {*} A new object adding the client-side render variables
 */
function addClientVars(componentId, vars, reactorId) {
    return {
        ...vars,
        ...{
            'this': `FuseWire.instances.${reactorId}.getInstance("${componentId}")`,
            'fuseWireComponentId': componentId
        }
    };
}

/**
 * @param {InstanceDao} dao
 * @param {Renderer} renderer
 * @param {*} componentResponse
 * @returns {Promise<Component>}
 */
async function convertToComponentIfNeeded(dao, renderer, componentResponse) {
    if (typeof(componentResponse) !== 'object' || componentResponse['fusewire-type'] !== 'component') {
        return componentResponse;
    }
    const componentId = dao.config.getComponentId(componentResponse.component, componentResponse.id);
    if (dao.exists(componentId)) {
        // TODO: what happens if version changes??
        const instance = dao.getInstance(componentId);
        dao.update(instance.fuseWireComponentId, componentResponse.vars, componentResponse.version);
        return instance;
    }
    return dao.create(await dao.templateDao.getOrFetch(componentResponse.component), componentResponse.vars, componentResponse.id, componentResponse.version);
}

/**
 * @param {*} renderer
 * @param {String} name
 * @param {Template} template
 * @param {*} constants
 * @return {Promise<Component>}
 */
async function createInstance(config, renderer, name, template, constants) {
    let url;
    try {
        const blob = new Blob([renderer.applyVarsToJs(template.getJsCode(), constants)], { type: "text/javascript" });
        url = URL.createObjectURL(blob);
    } catch (err) {
        config.log(`instance.js:createInstance:${name}: error rendering JS, throwing exception`);
        throw new FuseWireError(`Error rendering JS component "${name}"`, { cause: err });
    }
    let module;
    try {
        module = await import(url);
    } catch (err) {
        config.log(`instance.js:createInstance:${name}: component module failed to load, throwing exception`);
        throw new FuseWireError(`Error importing component "${name}"`,  { cause: err });
    } finally {
        URL.revokeObjectURL(url);
    }
    const className = name.split('_').pop();
    if (typeof(module[className]) !== 'function') {
        config.log(`instance.js:createInstance:${name}: component class ${className} not found, throwing exception`);
        throw new FuseWireError(`Cannot find component class "${className}" in its JS bundle.`);
    }
    try {
        return new module[className]();
    } catch (err) {
        config.log(`instance.js:createInstance:${name}: error instantiating component, throwing exception`);
        throw new FuseWireError(`Cannot instantiate class ${className} from coponent "${name}"`, { cause: err });
    }
}

/**
 * @param {JSON} jsonParser
 * @param {*} oldVars
 * @param {*} newVars
 * @returns {Array<String>} If both objects have the same values (=== comparison and no recursion)
 */
export function calculateChangedVars(jsonParser, oldVars, newVars) {
    const keys = Object.keys(newVars);
    const changedVars = [];
    for (const key of keys) {
        if (typeof(oldVars[key]) === 'undefined') {
            changedVars.push(key);
        } else {
            switch (typeof(newVars[key])) {
                case 'boolean':
                case 'number':
                case 'bigint':
                case 'string':
                    if (newVars[key] !== oldVars[key]) {
                        changedVars.push(key);
                    }
                    break;
                default:
                    if (jsonParser.stringify(newVars[key]) !== jsonParser.stringify(oldVars[key])) {
                        changedVars.push(key);
                    }
            }
        }
    }
    return changedVars;
}

/** Keep track of all active component instances in the application */
export class InstanceDao {
    /**
     * @param {Config} config
     * @param {Reactor} reactor
     * @param {TemplateDao} templateDao
     * @param {Renderer} renderer
     */
    constructor(config, reactor, templateDao, renderer) {
        this.config = config;
        this.reactor = reactor;
        this.templateDao = templateDao;
        this.renderer = renderer;
        this.instances = {};
    }

    /**
     * @param {String} id
     * @param {Template} template
     * @param {*} vars
     * @returns {Promise<Component>} the component instance created
     */
    async create(template, vars, id, version) {
        const componentId = this.config.getComponentId(template.getComponent(), id);
        const constants = getConstants(this.config, template.getComponent());
        this.config.log(`instance.js:create:${componentId}: instance not found, creating one`);
        const serverVarKeys = Object.keys(vars);
        const runesKeys = [];
        const instance = await createInstance(this.config, this.renderer, template.getComponent(), template, constants);
        instance.FuseWireReactor = this.reactor;
        instance.fuseWireComponentId = componentId;
        for (const key of Object.keys(vars)) {
            const openTag = constants.fuseWireTags[0];
            const regex = escapeRegexChars(`${openTag}{`) + '\\s*' + escapeRegexChars(`$${key}`) + '\\b';
            if (template.getHtmlCode().match(new RegExp(regex, 'gm'))) {
                runesKeys.push(key);
            }
        }
        this.config.log(`instance.js:create:${componentId}: hydrating`);
        for (const key of serverVarKeys) {
            if (typeof(vars[key]) === 'undefined') {
                throw new FuseWireError(`missingComponentKeyInServerResponse: ${template.getComponent()}.${key}`);
            }
            instance[key] = await convertToComponentIfNeeded(this, this.renderer, vars[key]);
        }
        this.instances[componentId] = {
            lastUpdated: Date.now(),
            instance: instance,
            component: template.getComponent(),
            id: id,
            serverVarKeys: serverVarKeys,
            runesKeys: runesKeys,
            version: version
        };
        await instance.hydrate();
        return instance;
    }

    /**
     * This is called when new server variables are available, and the instance already exists.
     * It's similar to hydrate(), but we can't do this async to avoid race condition (clients also modifying vars)
     * @param {String} componentId
     * @param {*} newVars
     * @param {String} newVersion
     */
    async update(componentId, newVars, newVersion) {
        this.config.log(`instance.js:update:${componentId}: applying new vars and calling update()`);
        const instance = this.getInstance(componentId);
        this.instances[componentId].version = newVersion;
        const oldVars = {};
        for (const key of this.getServerVarsKeys(componentId)) {
            oldVars[key] = instance[key];
            if (typeof(newVars[key]) === 'undefined') {
                // the client may have started this component without all the keys, fill in the blanks
                newVars[key] = null;
            }
            instance[key] = await convertToComponentIfNeeded(this, this.renderer, newVars[key]);
        }
        instance.update(oldVars);
    }

    /**
     * @param {String} id
     * @throws {FuseWireComponentNotFound}
     * @returns {Component}
     */
    getInstance(id) {
        if (typeof(this.instances[id]) === 'undefined' || !this.instances[id].instance) {
            throw new FuseWireComponentNotFound(id);
        }
        return this.instances[id].instance;
    }

    /**
     * @param {String} id
     * @return {Object} {name: {String}, id: {String}
     * @throws {FuseWireComponentNotFound}
     */
    getComponentNameAndId(id) {
        if (typeof(this.instances[id]) === 'undefined' || !this.instances[id].instance) {
            throw new FuseWireComponentNotFound(id);
        }
        return {
            name: this.instances[id].component,
            id: this.instances[id].id
        };
    }

    /**
     * @param {String} id
     * @returns {Boolean}
     */
    exists(id) {
        return typeof(this.instances[id]) !== 'undefined' && this.instances[id].instance;
    }

    /**
     * @param {String} id
     * @return {Array<String>}
     */
    getServerVarsKeys(id) {
        if (typeof(this.instances[id]) === 'undefined') {
            throw new FuseWireComponentNotFound(id);
        }
        return this.instances[id].serverVarKeys;
    }

    /**
     * @param {String} id
     * @return {Array<String>}
     */
    getRuneKeys(id) {
        if (typeof(this.instances[id]) === 'undefined') {
            throw new FuseWireComponentNotFound(id);
        }
        return this.instances[id].runesKeys;
    }

    /**
     * Extract variables from an object
     * @param {Component} component
     * @return {*}
     */
    extractVars(id) {
        const vars = {};
        const instance = this.getInstance(id);
        for (const key of this.getServerVarsKeys(id)) {
            vars[key] = instance[key];
        }
        return vars;
    }

    encodeVars(vars, mode) {
        const encodedVars = {};
        for (const key in vars) {
            if (vars[key] instanceof Component) {
                const componentId = vars[key].fuseWireComponentId;
                const {name, id} = this.getComponentNameAndId(componentId);
                encodedVars[key] = {
                    'fusewire-type': 'component',
                    mode: mode,
                    component: name,
                    id: id,
                    vars: this.encodeVars(this.extractVars(componentId))
                };
            } else {
                encodedVars[key] = vars[key];
            }
        }
        return encodedVars;
    }

    /**
     * Will return the current version of a component, if not exists will return the version of the stored template, or else an empty string
     * @param {String} component
     * @param {String} id
     * @returns {String}
     */
    getVersion(component, id) {
        const componentId = this.config.getComponentId(component, id);
        if (typeof(this.instances[component]) !== 'undefined') {
            return this.instances[component].version;
        }
        return this.templateDao.getVersion(component);
    }

    // TODO: keep in local storage, so we can reconstruct when no connection?
    // TODO: remove from dom?
    // TODO: cleanup render() storage
    remove(id) {
        if (typeof(this.instances[id]) === 'undefined') {
            this.config.log(`instance.js:remove:${id}: skipping, instance not found`);
            return;
        }
        try {
            this.instances[id].instance.destroy();
        } finally {
            this.config.log(`instance.js:remove:${id}: removing instance reference`);
            delete this.instances[id];
        }
    }

    /**
     * Private method, it deals with rendering and storing variables in local storage
     * @param {ComponentContainer} container
     * @param {String} componentId
     * @param {Boolean} isNew
     * @param {Template} template
     */
    render(container, componentId, isNew, template) {
        if (!container) {
            throw new FuseWireError(`containerNotInDom: trying to render "${componentId}"`);
        }
        const vars = this.extractVars(componentId);
        const oldState = this.config.getJsonParser().parse(this.config.getLocalStorage().getItem(`fusewire_vars_${componentId}`)) || { vars: {} };
        this.config.log(`reactor.js:_render:${componentId}: storing new state vars`);
        const newState = {
            lastUpdated: Date.now(),
            vars: this.encodeVars(vars)
        };
        this.config.getLocalStorage().setItem(`fusewire_vars_${componentId}`, this.config.getJsonParser().stringify(newState));
        const changedVarsKeys = calculateChangedVars(this.config.getJsonParser(), oldState.vars, newState.vars);
        const runeKeys = this.getRuneKeys(componentId);
        const instance = this.getInstance(componentId);
        const subComponents = {};
        for (const key in vars) {
            if (vars[key] instanceof Component) {
                subComponents[key] = vars[key];
                vars[key] = new ContainerPlaceHolder(vars[key].fuseWireComponentId);
            }
        }
        const fullRender = isNew || !changedVarsKeys.every(key => runeKeys.includes(key));
        if (fullRender) {
            this.config.log(`reactor.js:_render:${componentId}: full render`);
            this.renderer.render(container, componentId, template, addClientVars(componentId, vars, this.reactor.getId()), getConstants(this.config, template.getComponent()));
        } else {
            this.config.log(`reactor.js:_render:${componentId}: optimized render, just updating runes`);
            for (const key of changedVarsKeys) {
                if (!(vars[key] instanceof ContainerPlaceHolder)) {
                    const rune = this.reactor.getRoot().getRunes(componentId, key).item(0);
                    this.renderer.renderRune(rune, vars[key]);
                    this.config.afterRender(instance, rune);
                }
            }
        }
        for (const key in subComponents) {
            const subComponent = subComponents[key];
            const subComponentContainer = container.getSubComponent(subComponent.fuseWireComponentId);
            const {name: subComponentName} = this.getComponentNameAndId(subComponent.fuseWireComponentId);
            this.render(subComponentContainer, subComponent.fuseWireComponentId, isNew, this.templateDao.get(subComponentName));
        }
        if (fullRender) {
            // we dispatch this here, after any sub component was processed, so parent component can work with them if needed
            this.config.afterRender(instance, container);
        }
    }
}
