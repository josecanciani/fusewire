import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { ComponentId, toCssName } from './component-id.js';
import { Child, Lazy, ErrorBoundary, Root, PortalHost, PortalChild } from './component.js';
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
    ROUTE_DEFAULTS,
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
export function collectVars(instance) {
    /** @type {ComponentVars} */
    const vars = {};
    // 1. Collect standard public class variables
    for (const key of Object.keys(instance)) {
        vars[key] = instance[key];
    }
    // 2. Discover autocalculated getters (convention: start with $) on the component prototype chain
    let proto = Object.getPrototypeOf(instance);
    // Since Component.prototype instanceof Component is false, this elegantly boundaries the scan
    while (proto instanceof Component) {
        const props = Object.getOwnPropertyNames(proto);
        for (const key of props) {
            // Only consider properties starting with $ that haven't been shadowed
            if (key.startsWith('$') && !(key in vars)) {
                const descriptor = Object.getOwnPropertyDescriptor(proto, key);
                if (descriptor && typeof descriptor.get === 'function') {
                    vars[key] = instance[key];
                }
            }
        }
        proto = Object.getPrototypeOf(proto);
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
 * - Resolve Child declarations to real Component instances
 * - Wire framework state via Symbol keys: COMPONENT_ID, REGISTRY_ENTRY, CONSOLE, REACTOR
 * - Apply initial vars onto instance (overriding class field defaults)
 */
export class InstanceRegistry {
    /**
     * Create a new InstanceRegistry.
     * @param {import('./renderer.js').Renderer} renderer - The DOM renderer/morpher
     * @param {import('./template-store.js').TemplateStore} templateStore - Component template store
     * @param {string} appName - Built-in context prefix for component prefixes
     * @param {import('./persistence.js').Persistence} [persistence] - Optional persistence layer
     */
    constructor(renderer, templateStore, appName, persistence = null) {
        this._renderer = renderer;
        this._templateStore = templateStore;
        this._appName = appName;
        this.persistence = persistence;
        this._reactor = null; // Set by Reactor after construction
        this._instances = new Map(); // componentId.code -> { instance, container, parent, children }
        this._roots = new Set(); // codes of root components (no parent)
        this._componentClasses = new Map(); // componentName -> ComponentConstructor (pre-registered)

        this.registerComponent('FuseWire/Lazy', Lazy);
        this._templateStore.set('FuseWire/Lazy', {
            version: 'builtin',
            htmlCode: '((child))',
            cssCode: '',
            jsCode: '',
            fetchedAt: 0,
            etags: { html: '', css: '', js: '' },
        });
        this._templateStore.setCompiled(
            'FuseWire/Lazy',
            compileTemplate('((child))', '', this._appName),
        );

        this.registerComponent('FuseWire/ErrorBoundary', ErrorBoundary);
        this._templateStore.set('FuseWire/ErrorBoundary', {
            version: 'builtin',
            htmlCode: '((child))',
            cssCode: '',
            jsCode: '',
            fetchedAt: 0,
            etags: { html: '', css: '', js: '' },
        });
        this._templateStore.setCompiled(
            'FuseWire/ErrorBoundary',
            compileTemplate('((child))', '', this._appName),
        );

        this.registerComponent('FuseWire/Root', Root);
        this._templateStore.set('FuseWire/Root', {
            version: 'builtin',
            htmlCode: '((app))((portal))',
            cssCode: '',
            jsCode: '',
            fetchedAt: 0,
            etags: { html: '', css: '', js: '' },
        });
        this._templateStore.setCompiled(
            'FuseWire/Root',
            compileTemplate('((app))((portal))', '', this._appName),
        );

        this.registerComponent('FuseWire/PortalHost', PortalHost);
        this._templateStore.set('FuseWire/PortalHost', {
            version: 'builtin',
            htmlCode: '<div fw-each="child in children">((child))</div>',
            cssCode: '',
            jsCode: '',
            fetchedAt: 0,
            etags: { html: '', css: '', js: '' },
        });
        this._templateStore.setCompiled(
            'FuseWire/PortalHost',
            compileTemplate('<div fw-each="child in children">((child))</div>', '', this._appName),
        );

        this.registerComponent('FuseWire/PortalChild', PortalChild);
        this._templateStore.set('FuseWire/PortalChild', {
            version: 'builtin',
            htmlCode: '',
            cssCode: '',
            jsCode: '',
            fetchedAt: 0,
            etags: { html: '', css: '', js: '' },
        });
        this._templateStore.setCompiled(
            'FuseWire/PortalChild',
            compileTemplate('', '', this._appName),
        );
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
     * Create a component from a Child (resolves the class by name)
     * @param {Child} ref - Component reference to resolve
     * @param {HTMLElement} container - DOM container
     * @param {{deferHydration?: boolean, routeSegment?: import('./route-segment.js').RouteSegment}} options - Creation options
     * @returns {Promise<Component>} The created instance
     */
    async createFromReference(
        ref,
        container,
        { deferHydration = false, routeSegment = null } = {},
    ) {
        const ComponentClass = await this._loadComponentClass(ref.componentName);

        // Ensure template is loaded so we can read its version
        const version = await this._ensureTemplate(ref.componentName);
        const componentId = new ComponentId(ref.componentName, ref.componentId, version);

        return await this.create(componentId, ComponentClass, { ...ref.vars }, container, {
            deferHydration,
            routeSegment,
        });
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
     * If the Reactor's state store contains saved state for this component code,
     * the framework automatically restores scalar vars and recreates child
     * component references before calling init(previousState).
     *
     * @param {ComponentId} componentId - Component identifier
     * @param {ComponentConstructor} ComponentClass - Component class constructor
     * @param {ComponentVars} vars - Initial vars
     * @param {HTMLElement} container - DOM container
     * @param {{deferHydration?: boolean, routeSegment?: import('./route-segment.js').RouteSegment}} options - Creation options
     * @returns {Promise<Component>} The created instance
     */
    async create(
        componentId,
        ComponentClass,
        vars,
        container,
        { deferHydration = false, routeSegment = null } = {},
    ) {
        const code = componentId.code;
        if (this._instances.has(code)) {
            throw new Error(`Component ${code} already exists in registry`);
        }

        // Add component scope class to container
        container.classList.add(toCssName(componentId.name));

        const instance = new ComponentClass();

        // Check state store for previously captured state
        let previousState = null;
        const savedState = this.persistence.load(code);

        if (savedState) {
            // Restore state from store — envelope vars are already natively explicitly parsed by persistence
            const restoredVars = savedState.vars;

            // Filter out autocalculated getters ($ prefix) to prevent setter TypeErrors
            for (const key of Object.keys(restoredVars)) {
                if (key.startsWith('$')) {
                    delete restoredVars[key];
                }
            }

            Object.assign(instance, restoredVars);
            previousState = savedState.extraState;

            // Remove consumed state so it doesn't restore again on next create
            this.persistence.delete(code);
        } else {
            // Fresh mount — use provided vars
            Object.assign(instance, vars);
        }

        // Build registry entry — the single source of truth for container/parent.
        // The component holds a reference to this same object via REGISTRY_ENTRY,
        // so updates here are immediately visible through the getters.
        // needsHydration is set early so _mountChild can check it during render().
        const entry = {
            instance,
            container,
            parent: /** @type {import('./component.js').Component|null} */ (null),
            children: /** @type {Map<string, string>|null} */ (null),
            needsHydration: deferHydration,
        };
        this._instances.set(code, entry);
        this._roots.add(code);

        // Wire framework state (Symbol-keyed, invisible to Object.keys)
        instance[COMPONENT_ID] = componentId;
        instance[REGISTRY_ENTRY] = entry;
        instance[REACTOR] = this._reactor;
        instance[CONSOLE] = this._buildConsoleFor(componentId);

        // LIFECYCLE_ACTIVE stays set throughout creation to prevent premature react()
        try {
            // Snapshot route defaults before init() — init may apply URL values
            // that would overwrite the original defaults. The router compares
            // current state against this snapshot to omit unchanged properties.
            const routeDefaults = instance.routeState();
            if (routeDefaults && typeof routeDefaults === 'object') {
                instance[ROUTE_DEFAULTS] = { ...routeDefaults };
            }

            // Call init hook — pass previousState and routeSegment so the component
            // can skip fetches and restore from URL state on first render
            instance[LIFECYCLE_ACTIVE] = 'init';
            await instance.init(previousState, routeSegment);

            // Initial render
            instance[LIFECYCLE_ACTIVE] = 'render';
            await this.render(componentId);

            // Resolve library loads (started during init via loadLibrary)
            await this._resolveLibraries(instance);

            if (!deferHydration) {
                // Call hydrate hook (first render only — one-time post-render setup)
                instance[LIFECYCLE_ACTIVE] = 'hydrate';
                instance.hydrate();

                // Call afterRender hook
                instance[LIFECYCLE_ACTIVE] = 'afterRender';
                instance.afterRender();
            }
        } catch (error) {
            // Clean up registry if creation fails so we don't leave orphaned instances
            this.remove(componentId);
            throw error;
        } finally {
            // Only clear lifecycle if the instance wasn't removed in the catch block
            if (this._instances.has(code)) {
                instance[LIFECYCLE_ACTIVE] = null;
            }
        }

        if (!deferHydration) {
            // Component is fully mounted and ready
            instance.emit('fw-ready', instance);
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
     * @param {import('./route-segment.js').RouteSegment|null} routeSegment - Route segment for popstate navigation, or null
     */
    async update(componentId, newVars, routeSegment = null) {
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
            instance.update(newVars, false, routeSegment);

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
     * Remove instance and clean up (cascades to children).
     * Before teardown, snapshots the component's public vars and the
     * return value of destroy() into the Reactor's state store so the
     * component can be recreated with its previous state.
     * @param {ComponentId} componentId - Component identifier
     */
    remove(componentId) {
        const code = componentId.code;
        const entry = this._instances.get(code);

        if (!entry) {
            return; // Silently ignore non-existent instances
        }

        // Recursively remove children first (they capture their own state)
        if (entry.children) {
            for (const [, childId] of entry.children) {
                this.remove(childId);
            }
        }

        const { instance, container } = entry;

        // Snapshot public vars before destroy
        const vars = collectVars(instance);

        // Call destroy hook — capture return value as extra state
        const extraState = instance.destroy() || null;

        // Store captured state in the Reactor's persistence module
        this.persistence.save(code, { vars, extraState });

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
            await this._templateStore.requestTemplate(componentName, this._reactor.basePath);
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
        const { children: currentChildren, declarations } = this._collectChildComponents(instance);

        // Detach mount-point containers of orphaned children before morphing.
        // Without this, idiomorph may soft-match an orphaned mount-point element
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
        const vars = { ...this._reactor.globalVars, ...collectVars(instance) };

        // For PortalChild children not referenced in the template, inject
        // mount points into the compiled template's render output. This way
        // the morph sees them on every render — same pipeline as all children.
        // Only PortalChild is injected: other children (e.g. ErrorBoundary
        // internals) must NOT get auto-injected mount points.
        const originalRender = compiled.render.bind(compiled);
        const patchedCompiled = {
            ...compiled,
            /**
             * Render with injected mount points for unreferenced PortalChild vars
             * @param {import('./template-compiler.js').ComponentVars} v - Component variables
             * @param {ComponentId} cid - Component instance ID
             * @param {import('./template-compiler.js').TemplateConstants} c - Template constants
             * @returns {string} Rendered HTML
             */
            render(v, cid, c) {
                let html = originalRender(v, cid, c);
                for (const key of Object.keys(instance)) {
                    const val = instance[key];
                    if (!(val instanceof Child) || val.componentName !== 'FuseWire/PortalChild')
                        continue;
                    const childCode = new ComponentId(val.componentName, val.componentId || '')
                        .code;
                    if (html.includes(`data-fusewire-id="${childCode}"`)) continue;
                    html += `<fw-mount id="${childCode}" data-fusewire-id="${childCode}" data-fusewire-parent-id="${cid.code}"></fw-mount>`;
                }
                return html;
            },
        };

        const mountPoints = this._renderer.render(
            container,
            patchedCompiled,
            vars,
            componentId,
            constants,
        );

        // Auto-mount child components found in mount points
        for (const mountPoint of mountPoints) {
            await this._mountChild(mountPoint, instance, declarations);
        }

        // Detect eagerly-created children that were never mounted.
        // This means createChild() was called but the template has no ((varName))
        // mount point — the child is silently orphaned with no events, no hydration,
        // and no parent link. This is always a developer mistake.
        // Framework built-in components (FuseWire/*) are excluded because they
        // manage their own children internally (e.g. ErrorBoundary holds a
        // fallback child that is only mounted when an error occurs).
        if (!componentId.name.startsWith('FuseWire/')) {
            for (const [childCode, decl] of declarations) {
                if (decl instanceof Child && decl._creationPromise && !decl._replaced) {
                    // Check if the component was intentionally hidden by an fw-if condition.
                    // If the original template contains the placeholder, it's valid.
                    const varName = this._findVarNameForCode(instance, childCode);
                    if (varName && template.htmlCode.includes(`((${varName}))`)) {
                        continue; // Hidden by conditional rendering, this is fine
                    }

                    throw new Error(
                        `Component "${componentId.code}": child "${decl.toComponentId().code}" was created via createChild() but not referenced in the template. The child will not be mounted.`,
                    );
                }
            }
        }

        // Remove orphaned children (component cleanup — containers already detached above)
        for (const [childCode, childId] of previousChildren) {
            if (!currentChildren.has(childCode) && this.has(childId)) {
                this.remove(childId);
            }
        }

        // Track current children for next render cycle
        entry.children = currentChildren;
    }

    /**
     * Auto-mount a child component into its mount point.
     * Handles three cases:
     *   1. Eagerly created child (has _creationPromise) — await and attach
     *   2. Existing child from previous render — update container, re-render
     *   3. New child without eager creation — create from declaration
     * @private
     * @param {HTMLElement} mountPoint - Mount point element with data-fusewire-id
     * @param {Component} parentInstance - Parent component instance
     * @param {Map<string, Component|Child>} declarations - Pre-built declaration index for O(1) lookup
     * @returns {Promise<void>}
     */
    async _mountChild(mountPoint, parentInstance, declarations) {
        const childCode = mountPoint.getAttribute('data-fusewire-id');
        const childId = ComponentId.fromCode(childCode);

        // Check for an eagerly-created child (reference with _creationPromise)
        const decl = declarations.get(childCode) || null;

        if (decl instanceof Child && decl._creationPromise) {
            return await this._attachEagerChild(mountPoint, parentInstance, decl, childId);
        }

        if (this.has(childId)) {
            // Child already exists — update container reference if morphing replaced the element.
            // If the container is the same DOM node (preserved by morph), skip the re-render:
            // the child's DOM is already in place and the child manages its own updates via react().
            const entry = this._instances.get(childId.code);
            if (entry.container !== mountPoint) {
                entry.container = mountPoint;
                mountPoint.classList.add(toCssName(childId.name));
                await this.render(childId);
            }
            return;
        }

        // Find matching child declaration in parent's vars
        if (!decl) {
            throw new Error(
                `Mount point for "${childId.code}" found in DOM but no matching declaration in parent vars`,
            );
        }

        const parentEntry = this._instances.get(parentInstance[COMPONENT_ID].code);
        const parentDeferred = parentEntry.needsHydration;

        // Try to consume a route segment from the router for this child.
        // The route key is the var name on the parent that holds this child reference.
        let routeSegment = null;
        if (this._reactor.router) {
            const varName = this._findVarNameForCode(parentInstance, childCode);
            if (varName) {
                routeSegment = this._reactor.router.consumeSegment(varName);
            }
        }

        let childInstance;
        try {
            if (decl instanceof Child) {
                childInstance = await this.createFromReference(decl, mountPoint, {
                    deferHydration: parentDeferred,
                    routeSegment,
                });
                this._replaceRefInVars(parentInstance, decl, childInstance);
                decl._replayBufferedEvents(childInstance);
                decl._replaced = true;
            } else {
                // Legacy: Component instance used as declaration
                childInstance = await this.create(
                    childId,
                    /** @type {ComponentConstructor} */ (decl.constructor),
                    collectVars(decl),
                    mountPoint,
                    { deferHydration: parentDeferred },
                );
                decl[REACTOR] = this._reactor;
                decl[COMPONENT_ID] = childId;
            }
        } catch (error) {
            let handled = false;
            if (decl instanceof Child) {
                handled = decl._emitBuffered('fw-error', {
                    error,
                    failedComponent: decl.componentName,
                });
            }
            if (handled) {
                return;
            }
            throw error;
        }
        // Set parent on the child's registry entry and remove from roots
        const childInstanceCode = childInstance[COMPONENT_ID].code;
        this._instances.get(childInstanceCode).parent = parentInstance;
        this._roots.delete(childInstanceCode);
    }

    /**
     * Attach an eagerly-created child whose creation was started by startEagerCreation().
     * Awaits the creation promise, transfers DOM from the detached container into
     * the mount point, replays buffered events, and hydrates the subtree if the
     * parent is in the document.
     * @private
     * @param {HTMLElement} mountPoint - Mount point element in parent's DOM
     * @param {Component} parentInstance - Parent component instance
     * @param {Child} decl - The child reference with _creationPromise
     * @param {ComponentId} childId - Child component identity
     * @returns {Promise<void>}
     */
    async _attachEagerChild(mountPoint, parentInstance, decl, childId) {
        const parentEntry = this._instances.get(parentInstance[COMPONENT_ID].code);
        const parentDeferred = parentEntry.needsHydration;

        let childInstance;
        try {
            childInstance = await decl._creationPromise;

            // Deliver route segment to eagerly-created child before DOM transfer.
            // The child init'd with null routeSegment; if the router has a matching
            // segment, we update + re-render into the detached container so the user
            // never sees default state.
            if (this._reactor.router) {
                const varName = this._findVarNameForCode(parentInstance, childId.code);
                if (varName) {
                    const segment = this._reactor.router.consumeSegment(varName);
                    if (segment && childInstance.routeState() !== false) {
                        childInstance.update({}, false, segment);
                        await this.render(childInstance[COMPONENT_ID]);
                    }
                }
            }

            // Transfer rendered DOM from detached container into the real mount point
            const detached = decl._detachedContainer;
            while (detached.firstChild) {
                mountPoint.appendChild(detached.firstChild);
            }

            // Update registry entry's container to the real mount point
            const childEntry = this._instances.get(childInstance[COMPONENT_ID].code);
            childEntry.container = mountPoint;
            mountPoint.classList.add(toCssName(childId.name));

            // Replace reference with real instance in parent vars, replay events
            this._replaceRefInVars(parentInstance, decl, childInstance);
            decl._replayBufferedEvents(childInstance);
            decl._replaced = true;

            // Set parent
            childEntry.parent = parentInstance;
            this._roots.delete(childInstance[COMPONENT_ID].code);

            // Hydrate the subtree if the parent is in the document (not deferred)
            if (!parentDeferred) {
                await this._hydrateSubtree(childInstance[COMPONENT_ID]);
            }
        } catch (error) {
            // Clean up instance if it failed during hydration
            if (childInstance) {
                this.remove(childInstance[COMPONENT_ID]);
            }
            const handled = decl._emitBuffered('fw-error', {
                error,
                failedComponent: childId.name,
            });
            if (handled) {
                return;
            }
            throw error;
        }
    }

    /**
     * Start eager creation of a child component in a detached container.
     * Called by Component.createChild() to kick off the creation pipeline
     * immediately, without waiting for the parent's render to discover
     * mount points. The child's init(), render(), and library resolution
     * run in parallel with other children and with the parent's render.
     * hydrate() and afterRender() are deferred until the child is attached
     * to the document.
     * @param {Child} ref - Component reference to eagerly create
     */
    startEagerCreation(ref) {
        const code = new ComponentId(ref.componentName, ref.componentId || '').code;

        // If explicitly requested via createChild, force fresh state
        if (this.persistence && this.persistence.has(code)) {
            this.persistence.delete(code);
        }

        // If the component already exists in the registry (e.g. re-render with
        // same children), skip eager creation — _mountChild will re-render it.
        if (this._instances.has(code)) {
            return;
        }
        const container = document.createElement('div');
        ref._detachedContainer = container;

        const promise = this._eagerCreate(ref, container);
        promise.catch(() => {
            // Prevent unhandled promise rejections if the eager child fails but is never mounted
        });
        ref._creationPromise = promise;
    }

    /**
     * Execute the eager creation pipeline for a child component.
     * Loads the class, fetches the template, and runs init + render + library
     * resolution into a detached container. On failure, cleans up partial state.
     * @private
     * @param {Child} ref - Component reference
     * @param {HTMLElement} container - Detached container to render into
     * @returns {Promise<Component>} The created instance (pending hydration)
     */
    async _eagerCreate(ref, container) {
        const code = new ComponentId(ref.componentName, ref.componentId || '').code;
        try {
            return await this.createFromReference(ref, container, { deferHydration: true });
        } catch (error) {
            // Clean up partial instance from registry
            if (this._instances.has(code)) {
                this._instances.delete(code);
                this._roots.delete(code);
            }
            throw error;
        }
    }

    /**
     * Hydrate a component subtree after attachment to the document.
     * Walks children first (bottom-up) so that when a parent's hydrate() runs,
     * all children are already hydrated. Only processes components with
     * needsHydration=true (i.e., those created with deferHydration).
     * @private
     * @param {ComponentId} componentId - Root of the subtree to hydrate
     */
    async _hydrateSubtree(componentId) {
        const entry = this._instances.get(componentId.code);
        if (!entry) return;

        // Recursively update containers for children whose mount points moved
        // from the detached tree into the document
        if (entry.children) {
            for (const [childCode] of entry.children) {
                const childEntry = this._instances.get(childCode);
                if (childEntry) {
                    await this._hydrateSubtree(ComponentId.fromCode(childCode));
                }
            }
        }

        // Hydrate this component if deferred
        if (entry.needsHydration) {
            const instance = entry.instance;
            try {
                instance[LIFECYCLE_ACTIVE] = 'hydrate';
                instance.hydrate();

                instance[LIFECYCLE_ACTIVE] = 'afterRender';
                instance.afterRender();
                entry.needsHydration = false;
                instance[LIFECYCLE_ACTIVE] = null;
            } catch (error) {
                entry.needsHydration = false;
                instance[LIFECYCLE_ACTIVE] = null;
                const handled = instance.emitCancellable('fw-error', {
                    error,
                    failedComponent: componentId.name,
                });
                if (!handled) {
                    throw error;
                }
            }

            if (!entry.needsHydration) {
                // Component is fully mounted and ready
                instance.emit('fw-ready', instance);
            }
        }
    }

    /**
     * Search a component instance's own properties for a child declaration matching the given ID
     * @private
     * @param {Component} instance - Parent component instance
     * @param {ComponentId} childId - Child component ID to match
     * @returns {Component|Child|null} Matching declaration or null
     */
    _findChildDeclaration(instance, childId) {
        for (const key of Object.keys(instance)) {
            const value = instance[key];
            if (this._matchesChildId(value, childId)) {
                return /** @type {Component|Child} */ (value);
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (this._matchesChildId(item, childId)) {
                        return /** @type {Component|Child} */ (item);
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
        if (value instanceof Child) {
            return value.componentName === childId.name && (value.componentId || '') === childId.id;
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
     * Find the var name on a parent instance that holds a child with the given code.
     * Scans string-keyed properties for Component/Child instances whose code matches.
     * @private
     * @param {Component} parentInstance - Parent component instance
     * @param {string} childCode - Child component code to find (e.g. "Sidebar#main")
     * @returns {string|null} Var name (property key) or null if not found
     */
    _findVarNameForCode(parentInstance, childCode) {
        for (const key of Object.keys(parentInstance)) {
            const value = parentInstance[key];
            if (
                (value instanceof Component || value instanceof Child) &&
                value.componentCode === childCode
            ) {
                return key;
            }
        }
        return null;
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
    clearAll() {
        const codes = Array.from(this._instances.keys());
        for (const code of codes) {
            const componentId = ComponentId.fromCode(code);
            this.remove(componentId);
        }
    }

    /**
     * Pre-fetch a component's class and template into the cache.
     * After this resolves, createFromReference() for this component name
     * will find both the class and template already cached — no network
     * round-trip required.
     * @param {string} componentName - Component name (e.g., 'List/Item')
     * @returns {Promise<void>}
     */
    async preload(componentName) {
        await Promise.all([
            this._loadComponentClass(componentName),
            this._ensureTemplate(componentName),
        ]);
    }

    /**
     * Resolve all pending library loads for a component instance.
     * Awaits each promise started by loadLibrary() during init() and stores
     * the full module on the entry so library() can return it synchronously
     * in hydrate().
     * @private
     * @param {Component} instance - Component instance
     */
    async _resolveLibraries(instance) {
        const libs = instance[LIBRARIES];
        if (!libs) return;
        for (const [, entry] of libs) {
            entry.module = await entry.promise;
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
        const reactorConsole = this._reactor.console;
        return {
            /**
             * Log a message to the wrapped console.
             * @param {string} message - Base string
             * @param {...*} args - Trailing params
             * @returns {void}
             */
            log: (message, ...args) =>
                reactorConsole.log(new LogMessage(componentId, message), ...args),
            /**
             * Log a warning to the wrapped console.
             * @param {string} message - Base string
             * @param {...*} args - Trailing params
             * @returns {void}
             */
            warn: (message, ...args) =>
                reactorConsole.warn(new LogMessage(componentId, message), ...args),
            /**
             * Log an error to the wrapped console.
             * @param {string} message - Base string
             * @param {...*} args - Trailing params
             * @returns {void}
             */
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

        const basePath = this._reactor.basePath;
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
     * Recognises both Child and legacy Component instances.
     * Returns two maps: one for component identity (code -> ComponentId) and one
     * for fast declaration lookup (code -> Component|Child).
     * @private
     * @param {Component} instance - Component instance
     * @returns {{children: Map<string, ComponentId>, declarations: Map<string, Component|Child>}} Maps keyed by component code
     */
    _collectChildComponents(instance) {
        const children = new Map();
        const declarations = new Map();
        for (const key of Object.keys(instance)) {
            const value = instance[key];
            this._collectIfComponent(/** @type {VarValue} */ (value), children, declarations);
            if (Array.isArray(value)) {
                for (const item of value) {
                    this._collectIfComponent(item, children, declarations);
                }
            }
        }
        return { children, declarations };
    }

    /**
     * If value is a component declaration, add its identity to the children map
     * and store the declaration itself in the declarations map for O(1) lookup.
     * @private
     * @param {VarValue} value - Value to check
     * @param {Map<string, ComponentId>} children - Map to add identity to
     * @param {Map<string, Component|Child>} declarations - Map to add declaration to
     */
    _collectIfComponent(value, children, declarations) {
        if (!this._isComponentDecl(value)) return;
        let name;
        let id;
        if (value instanceof Child) {
            name = value.componentName;
            id = value.componentId || '';
        } else {
            const decl = /** @type {Component} */ (value);
            name = /** @type {ComponentConstructor} */ (decl.constructor).componentName;
            id = decl.componentId || '';
        }
        const componentId = new ComponentId(name, id);
        children.set(componentId.code, componentId);
        declarations.set(componentId.code, /** @type {Component|Child} */ (value));
    }

    /**
     * Check if a value is a component declaration (Child or Component instance)
     * @private
     * @param {VarValue|Array<VarValue>} value - Value to check
     * @returns {boolean} True if value is a component declaration
     */
    _isComponentDecl(value) {
        return value instanceof Child || value instanceof Component;
    }

    /**
     * Replace a Child with the real Component instance in the parent's
     * own properties. Searches string-keyed properties and array items by identity (===).
     * @private
     * @param {Component} parentInstance - Parent component instance
     * @param {Child} ref - The reference to replace
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

        // PortalHost subtrees are excluded — broadcasts reach portal children
        // only via PortalChild forwarding to prevent double-delivery
        if (instance instanceof PortalHost) return;

        let stopped = false;
        if (instance[EVENTS]) {
            const result = instance[EVENTS].emitBroadcast(eventName, ...args);
            for (const err of result.errors) {
                instance[CONSOLE].error(`broadcast('${eventName}') listener threw: ${err.message}`);
            }
            stopped = result.stopped;
        }
        if (stopped) return;

        // Forward broadcast through PortalChild bridge to the real child
        if (instance instanceof PortalChild) {
            const host = this._reactor.getPortalHostSync(instance.portalHostId);
            if (host) {
                host.broadcastToChild(instance.getChildCode(), eventName, args);
            }
        }

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
