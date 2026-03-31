import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { ComponentId, toCssName } from './component-id.js';
import { ComponentReference } from './component-reference.js';
import { Component } from './component.js';
import { LogMessage } from './log-message.js';
import { compileTemplate } from './template-compiler.js';
import {
    COMPONENT_ID,
    REGISTRY_ENTRY,
    CONSOLE,
    REACTOR,
    LIFECYCLE_ACTIVE,
    EVENTS,
    LIBRARIES,
} from './symbols.js';

/** @typedef {import('./component.js').ComponentVars} ComponentVars */
/** @typedef {import('./component.js').VarValue} VarValue */
/** @typedef {import('./component.js').ComponentConstructor} ComponentConstructor */

/**
 * Collect component vars from an instance's own properties.
 * Returns all own enumerable string-keyed properties. Framework state is stored
 * under Symbol keys (invisible to Object.keys), so no filtering is needed.
 * @param {Component} instance - Component instance
 * @returns {ComponentVars} Plain object with component vars
 */
function collectVars(instance) {
    /** @type {ComponentVars} */
    const vars = {};
    for (const key of Object.keys(instance)) {
        vars[key] = instance[key];
    }
    return vars;
}

/**
 * InstanceRegistry manages component instances and their lifecycle.
 *
 * Responsibilities:
 * - Create/update/remove component instances
 * - Call lifecycle hooks (init, update, destroy)
 * - Coordinate rendering with Renderer
 * - Manage component tree (parent/child relationships)
 * - Resolve ComponentReference declarations to real Component instances
 * - Wire framework state via Symbol keys: COMPONENT_ID, REGISTRY_ENTRY, CONSOLE, REACTOR
 * - Apply initial vars onto instance (overriding class field defaults)
 */
export class InstanceRegistry {
    constructor(renderer, templateStore, appName = 'default') {
        this._renderer = renderer;
        this._templateStore = templateStore;
        this._appName = appName;
        this._reactor = null; // Set by Reactor after construction
        this._instances = new Map(); // componentId.code -> { instance, container, parent, children }
        this._roots = new Set(); // codes of root components (no parent)
        this._componentClasses = new Map(); // componentName -> ComponentConstructor (pre-registered)
    }

    /**
     * Pre-register a component class for name-based resolution.
     * Used in tests and when dynamic import() is not available.
     * @param {string} name - Component name
     * @param {ComponentConstructor} ComponentClass - The component class constructor
     */
    registerComponent(name, ComponentClass) {
        Object.defineProperty(ComponentClass, 'componentName', {
            value: name,
            configurable: true,
        });
        this._componentClasses.set(name, ComponentClass);
    }

    /**
     * Create a component from a ComponentReference (resolves the class by name)
     * @param {ComponentReference} ref - Component reference to resolve
     * @param {HTMLElement} container - DOM container
     * @returns {Promise<Component>} The created instance
     */
    async createFromReference(ref, container) {
        const ComponentClass = await this._loadComponentClass(ref.componentName);

        // Ensure template is loaded so we can read its version
        const version = await this._ensureTemplate(ref.componentName);
        const componentId = new ComponentId(ref.componentName, ref.id, version);

        return await this.create(componentId, ComponentClass, { ...ref.vars }, container);
    }

    /**
     * Create a new component instance.
     *
     * Wires all framework state on the instance via Symbol keys:
     *   - COMPONENT_ID    → ComponentId object (name, id, version, code)
     *   - REGISTRY_ENTRY  → shared entry object (container, parent) — same object stored in the registry
     *   - CONSOLE         → pre-built console wrapper with component context
     *   - REACTOR         → Reactor reference
     *
     * @param {ComponentId} componentId - Component identifier
     * @param {ComponentConstructor} ComponentClass - Component class constructor
     * @param {ComponentVars} vars - Initial vars
     * @param {HTMLElement} container - DOM container
     * @returns {Promise<Component>} The created instance
     */
    async create(componentId, ComponentClass, vars, container) {
        const code = componentId.code;
        if (this._instances.has(code)) {
            throw new Error(`Component ${code} already exists in registry`);
        }

        // Add component scope class to container
        container.classList.add(toCssName(componentId.name));

        const instance = new ComponentClass();
        Object.assign(instance, vars);

        // Build registry entry — the single source of truth for container/parent.
        // The component holds a reference to this same object via REGISTRY_ENTRY,
        // so updates here are immediately visible through the getters.
        const entry = { instance, container, parent: null, children: null };
        this._instances.set(code, entry);
        this._roots.add(code);

        // Wire framework state (Symbol-keyed, invisible to Object.keys)
        instance[COMPONENT_ID] = componentId;
        instance[REGISTRY_ENTRY] = entry;
        instance[REACTOR] = this._reactor;
        instance[CONSOLE] = this._buildConsoleFor(componentId);

        // LIFECYCLE_ACTIVE stays set throughout creation to prevent premature react()
        try {
            // Call init hook
            instance[LIFECYCLE_ACTIVE] = 'init';
            await instance.init();

            // Initial render
            instance[LIFECYCLE_ACTIVE] = 'render';
            await this.render(componentId);

            // Resolve library loads (started during init via loadLibrary)
            await this._resolveLibraries(instance);

            // Call hydrate hook (first render only — one-time post-render setup)
            instance[LIFECYCLE_ACTIVE] = 'hydrate';
            instance.hydrate();

            // Call afterRender hook
            instance[LIFECYCLE_ACTIVE] = 'afterRender';
            instance.afterRender();
        } finally {
            instance[LIFECYCLE_ACTIVE] = null;
        }

        return instance;
    }

    /**
     * Get an existing instance
     * @param {ComponentId|string} componentId - Component identifier or code string (e.g., "Counter#main")
     * @returns {Component|null} The component instance or null if not found
     */
    get(componentId) {
        const code = typeof componentId === 'string' ? componentId : componentId.code;
        const entry = this._instances.get(code);
        return entry ? entry.instance : null;
    }

    /**
     * Update an existing instance with new vars (server-side flow).
     * Uses Component.update() with react=false because this method
     * handles rendering explicitly.
     * @param {ComponentId} componentId - Component identifier
     * @param {ComponentVars} newVars - New variable values to merge
     */
    async update(componentId, newVars) {
        const code = componentId.code;
        const entry = this._instances.get(code);

        if (!entry) {
            throw new ComponentNotFoundError(code);
        }

        const { instance } = entry;

        // LIFECYCLE_ACTIVE stays set through update → render → afterRender
        try {
            // Merge vars without triggering react — we handle rendering below
            instance[LIFECYCLE_ACTIVE] = 'update';
            instance.update(newVars, false);

            // Re-render
            instance[LIFECYCLE_ACTIVE] = 'render';
            await this.render(componentId);

            // Call afterRender hook
            instance[LIFECYCLE_ACTIVE] = 'afterRender';
            instance.afterRender();
        } finally {
            instance[LIFECYCLE_ACTIVE] = null;
        }
    }

    /**
     * Remove instance and clean up (cascades to children)
     * @param {ComponentId} componentId - Component identifier
     */
    async remove(componentId) {
        const code = componentId.code;
        const entry = this._instances.get(code);

        if (!entry) {
            return; // Silently ignore non-existent instances
        }

        // Recursively remove children first
        if (entry.children) {
            for (const [, childId] of entry.children) {
                await this.remove(childId);
            }
        }

        const { instance, container } = entry;

        // Call destroy hook
        await instance.destroy();

        // Clear event subscriptions so handlers don't keep parent instances alive
        if (instance[EVENTS]) instance[EVENTS].clear();

        // Remove from DOM
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }

        // Remove from registry
        this._instances.delete(code);
        this._roots.delete(code);
    }

    /**
     * Ensure a component's template is loaded into the store.
     * Lazy-fetches from basePath if not already present.
     * @private
     * @param {string} componentName - Component name
     * @returns {Promise<string>} Template version hash
     */
    async _ensureTemplate(componentName) {
        if (!this._templateStore.has(componentName) && this._reactor) {
            await this._templateStore.fetch(componentName, this._reactor._basePath);
        }
        const template = this._templateStore.get(componentName);
        if (!template) {
            throw new Error(`Template not found for component ${componentName}`);
        }
        return template.version;
    }

    /**
     * Render a component instance to its container.
     * Callers must ensure renders are serialized (the Reactor's render queue
     * handles this for react() calls; internal callers like _mountChild and
     * create() are already within a parent's render and thus serialized).
     * @param {ComponentId} componentId - Component identifier
     */
    async render(componentId) {
        const code = componentId.code;
        const entry = this._instances.get(code);

        if (!entry) {
            throw new ComponentNotFoundError(code);
        }

        const { instance, container } = entry;
        const componentName = instance.componentName;

        // Lazy-load template from basePath if not already in store.
        // IMPORTANT: the `if` guard keeps render() synchronous when the template
        // is already cached. An unconditional `await` would yield to the microtask
        // queue and break callers that expect fire-and-forget react() to update
        // the DOM before the next synchronous statement runs (e.g. Playground).
        if (!this._templateStore.has(componentName)) {
            await this._ensureTemplate(componentName);
        }

        // Get template from store
        const template = this._templateStore.get(componentName);

        // Get or compile template
        let compiled = this._templateStore.getCompiled(componentName);
        if (!compiled) {
            compiled = compileTemplate(template.htmlCode, template.cssCode, this._appName);
            this._templateStore.setCompiled(componentName, compiled);
        }

        // Snapshot current child declarations from vars before rendering
        const currentChildren = this._collectChildComponents(instance);

        // Detach mount-point containers of orphaned children before morphing.
        // Without this, idiomorph may soft-match an orphaned mount-point <div>
        // with unrelated new content and skip the morph (the beforeNodeMorphed
        // callback returns false for data-fusewire-id nodes), silently dropping
        // the new content that should have replaced it.
        const previousChildren = entry.children || new Map();
        for (const [childCode] of previousChildren) {
            if (!currentChildren.has(childCode)) {
                const childEntry = this._instances.get(childCode);
                if (childEntry && childEntry.container.parentNode) {
                    childEntry.container.remove();
                }
            }
        }

        // Build template constants
        const constants = { version: componentId.version };

        // Render to DOM and find child mount points.
        // Global vars (registered via reactor.registerGlobal) are merged at lower
        // priority — component vars override on name collision.
        const vars = { ...this._reactor._globalVars, ...collectVars(instance) };
        const mountPoints = this._renderer.render(
            container,
            compiled,
            vars,
            componentId,
            constants,
        );

        // Auto-mount child components found in mount points
        for (const mountPoint of mountPoints) {
            await this._mountChild(mountPoint, instance);
        }

        // Remove orphaned children (component cleanup — containers already detached above)
        for (const [childCode, childId] of previousChildren) {
            if (!currentChildren.has(childCode) && this.has(childId)) {
                await this.remove(childId);
            }
        }

        // Track current children for next render cycle
        entry.children = currentChildren;
    }

    /**
     * Auto-mount a child component into its mount point
     * @private
     * @param {HTMLElement} mountPoint - Mount point element with data-fusewire-id
     * @param {Component} parentInstance - Parent component instance
     */
    async _mountChild(mountPoint, parentInstance) {
        const childCode = mountPoint.getAttribute('data-fusewire-id');
        const childId = ComponentId.fromCode(childCode);

        if (this.has(childId)) {
            // Child already exists — update container reference (morphing may replace elements)
            const entry = this._instances.get(childId.code);
            entry.container = mountPoint;
            mountPoint.classList.add(toCssName(childId.name));
            await this.render(childId);
            return;
        }

        // Find matching child declaration in parent's vars
        const decl = this._findChildDeclaration(parentInstance, childId);
        if (!decl) {
            throw new Error(
                `Mount point for "${childId.code}" found in DOM but no matching declaration in parent vars`,
            );
        }

        let childInstance;
        if (decl instanceof ComponentReference) {
            childInstance = await this.createFromReference(decl, mountPoint);
            // Replace the transient ComponentReference with the real Component in the
            // parent's own properties. From this point on, parent code that accesses
            // the property (e.g. this.logs.at(-1)) gets the Component directly and can
            // call update() on it. The old reference is marked as replaced so that any
            // stale usage throws.
            this._replaceRefInVars(parentInstance, decl, childInstance);
            // Replay buffered .on() calls from the reference onto the real Component
            decl._replayBufferedEvents(childInstance);
            decl._replaced = true;
        } else {
            // Legacy: Component instance used as declaration
            childInstance = await this.create(
                childId,
                /** @type {ComponentConstructor} */ (decl.constructor),
                collectVars(decl),
                mountPoint,
            );
            // Link declaration to reactor so it can trigger re-renders via react()
            decl[REACTOR] = this._reactor;
            decl[COMPONENT_ID] = childId;
        }
        // Set parent on the child's registry entry and remove from roots
        const childInstanceCode = childInstance[COMPONENT_ID].code;
        this._instances.get(childInstanceCode).parent = parentInstance;
        this._roots.delete(childInstanceCode);
    }

    /**
     * Search a component instance's own properties for a child declaration matching the given ID
     * @private
     * @param {Component} instance - Parent component instance
     * @param {ComponentId} childId - Child component ID to match
     * @returns {Component|ComponentReference|null} Matching declaration or null
     */
    _findChildDeclaration(instance, childId) {
        for (const key of Object.keys(instance)) {
            const value = instance[key];
            if (this._matchesChildId(value, childId)) {
                return /** @type {Component|ComponentReference} */ (value);
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (this._matchesChildId(item, childId)) {
                        return /** @type {Component|ComponentReference} */ (item);
                    }
                }
            }
        }
        return null;
    }

    /**
     * Check if a value is a component declaration matching the given ID
     * @private
     * @param {VarValue|Array<VarValue>} value - Value to check
     * @param {ComponentId} childId - Expected component ID
     * @returns {boolean} True if value matches
     */
    _matchesChildId(value, childId) {
        if (value instanceof ComponentReference) {
            return value.componentName === childId.name && (value.id || '') === childId.id;
        }
        // Legacy: Component instance
        const decl = /** @type {Component} */ (value);
        return (
            decl &&
            typeof decl === 'object' &&
            /** @type {ComponentConstructor} */ (decl.constructor).componentName === childId.name &&
            (decl.componentId || '') === childId.id
        );
    }

    /**
     * Check if instance exists
     * @param {ComponentId} componentId - Component identifier
     * @returns {boolean} True if instance exists in registry
     */
    has(componentId) {
        return this._instances.has(componentId.code);
    }

    /**
     * Get container element for an instance
     * @param {ComponentId} componentId - Component identifier
     * @returns {HTMLElement|null} Container element or null if not found
     */
    getContainer(componentId) {
        const entry = this._instances.get(componentId.code);
        return entry ? entry.container : null;
    }

    /**
     * Clear all instances (for cleanup/testing)
     */
    async clearAll() {
        const codes = Array.from(this._instances.keys());
        for (const code of codes) {
            const componentId = ComponentId.fromCode(code);
            await this.remove(componentId);
        }
    }

    /**
     * Resolve all pending library loads for a component instance.
     * Awaits each promise started by loadLibrary() during init(), validates
     * that requested exports exist, and stores the module on the entry so
     * library() can access it synchronously in hydrate().
     * @private
     * @param {Component} instance - Component instance
     */
    async _resolveLibraries(instance) {
        const libs = instance[LIBRARIES];
        if (!libs) return;
        for (const [name, entry] of libs) {
            entry.module = await entry.promise;
            for (const exportName of entry.exportNames) {
                if (!(exportName in entry.module)) {
                    throw new Error(`Library "${name}" does not export "${exportName}"`);
                }
            }
        }
    }

    /**
     * Build a pre-bound console wrapper for a component.
     * The wrapper creates LogMessage objects with the component's identity
     * and forwards them (plus any extra args) to the reactor's console
     * multiplexer. Extra args are passed through for the native console
     * but are NOT stored in the LogMessage (avoids object references).
     * @private
     * @param {ComponentId} componentId - Component identity
     * @returns {import('./reactor.js').ConsoleLike} Console-like object
     */
    _buildConsoleFor(componentId) {
        const reactorConsole = this._reactor._console;
        return {
            log: (message, ...args) =>
                reactorConsole.log(new LogMessage(componentId, message), ...args),
            warn: (message, ...args) =>
                reactorConsole.warn(new LogMessage(componentId, message), ...args),
            error: (message, ...args) =>
                reactorConsole.error(new LogMessage(componentId, message), ...args),
        };
    }

    /**
     * Load a component class by name.
     * Checks pre-registered classes first, then falls back to dynamic import.
     * @private
     * @param {string} componentName - Component name (e.g., 'Counter', 'Basics/Counter')
     * @returns {Promise<ComponentConstructor>} The component class constructor
     */
    async _loadComponentClass(componentName) {
        if (this._componentClasses.has(componentName)) {
            return this._componentClasses.get(componentName);
        }

        if (!this._reactor) {
            throw new Error(
                `Cannot load component "${componentName}": no reactor attached and class not pre-registered`,
            );
        }

        const basePath = this._reactor._basePath;
        const module = await import(`${basePath}/${componentName}.js`);

        // Try named export matching the simple name, then the full name, then default
        const simpleName = componentName.includes('/')
            ? componentName.split('/').pop()
            : componentName;
        const ComponentClass = module[simpleName] || module[componentName] || module.default;

        if (!ComponentClass || typeof ComponentClass !== 'function') {
            throw new Error(
                `Component class "${componentName}" not found in ${basePath}/${componentName}.js`,
            );
        }

        // Set the canonical component name on the class
        Object.defineProperty(ComponentClass, 'componentName', {
            value: componentName,
            configurable: true,
        });

        // Cache for future use
        this._componentClasses.set(componentName, ComponentClass);
        return ComponentClass;
    }

    /**
     * Collect component declarations from an instance's own properties (top-level values and array items).
     * Recognises both ComponentReference and legacy Component instances.
     * @private
     * @param {Component} instance - Component instance
     * @returns {Map<string, ComponentId>} Map of component code to ComponentId
     */
    _collectChildComponents(instance) {
        const children = new Map();
        for (const key of Object.keys(instance)) {
            const value = instance[key];
            this._collectIfComponent(/** @type {VarValue} */ (value), children);
            if (Array.isArray(value)) {
                for (const item of value) {
                    this._collectIfComponent(item, children);
                }
            }
        }
        return children;
    }

    /**
     * If value is a component declaration, add its identity to the children map
     * @private
     * @param {VarValue} value - Value to check
     * @param {Map<string, ComponentId>} children - Map to add to
     */
    _collectIfComponent(value, children) {
        if (!this._isComponentDecl(value)) return;
        let name;
        let id;
        if (value instanceof ComponentReference) {
            name = value.componentName;
            id = value.id || '';
        } else {
            const decl = /** @type {Component} */ (value);
            name = /** @type {ComponentConstructor} */ (decl.constructor).componentName;
            id = decl.componentId || '';
        }
        const componentId = new ComponentId(name, id);
        children.set(componentId.code, componentId);
    }

    /**
     * Check if a value is a component declaration (ComponentReference or Component instance)
     * @private
     * @param {VarValue|Array<VarValue>} value - Value to check
     * @returns {boolean} True if value is a component declaration
     */
    _isComponentDecl(value) {
        return value instanceof ComponentReference || value instanceof Component;
    }

    /**
     * Replace a ComponentReference with the real Component instance in the parent's
     * own properties. Searches string-keyed properties and array items by identity (===).
     * @private
     * @param {Component} parentInstance - Parent component instance
     * @param {ComponentReference} ref - The reference to replace
     * @param {Component} childInstance - The real Component instance
     */
    _replaceRefInVars(parentInstance, ref, childInstance) {
        for (const key of Object.keys(parentInstance)) {
            const value = parentInstance[key];
            if (value === ref) {
                parentInstance[key] = childInstance;
                return;
            }
            if (Array.isArray(value)) {
                const idx = value.indexOf(ref);
                if (idx !== -1) {
                    value[idx] = childInstance;
                    return;
                }
            }
        }
    }

    /**
     * Broadcast an event top-down through the component tree starting from root(s).
     * Called by Reactor.broadcast() after reactor-level listeners have fired.
     * Uses the cached _roots set for O(1) root lookup.
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Arguments forwarded to each handler
     */
    broadcastFromRoots(eventName, args) {
        for (const code of this._roots) {
            this._broadcastToEntry(this._instances.get(code), eventName, args);
        }
    }

    /**
     * Broadcast an event top-down starting from a specific component and its children.
     * Called by Component.broadcast() for subtree-scoped broadcasts.
     * @param {ComponentId} componentId - Component to broadcast from
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Arguments forwarded to each handler
     */
    broadcastFrom(componentId, eventName, args) {
        const entry = this._instances.get(componentId.code);
        if (entry) {
            this._broadcastToEntry(entry, eventName, args);
        }
    }

    /**
     * Recursively broadcast an event to a single registry entry and its children.
     * If any handler on the entry returns false, propagation stops for that subtree.
     * @private
     * @param {{instance: Component, container: HTMLElement, parent: Component|null, children: Map<string, ComponentId>|null}} entry - Registry entry
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Arguments forwarded to each handler
     */
    _broadcastToEntry(entry, eventName, args) {
        const { instance } = entry;
        let stopped = false;
        if (instance[EVENTS]) {
            const result = instance[EVENTS].emitBroadcast(eventName, ...args);
            for (const err of result.errors) {
                instance[CONSOLE].error(`broadcast('${eventName}') listener threw: ${err.message}`);
            }
            stopped = result.stopped;
        }
        if (stopped) return;
        if (entry.children) {
            for (const [childCode] of entry.children) {
                const childEntry = this._instances.get(childCode);
                if (childEntry) {
                    this._broadcastToEntry(childEntry, eventName, args);
                }
            }
        }
    }
}
