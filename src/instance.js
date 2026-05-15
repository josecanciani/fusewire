import { ComponentId } from './component-id.js';
import {
    Component,
    Child,
    Lazy,
    ErrorBoundary,
    Root,
    PortalHost,
    PortalChild,
} from './component.js';
import {
    COMPONENT_ID,
    REGISTRY_ENTRY,
    LIFECYCLE_ACTIVE,
    EVENTS,
    ROUTE_DEFAULTS,
    REACTOR,
    CONSOLE,
    LIBRARIES,
} from './symbols.js';
import { ComponentNotFoundError } from './errors/error-hierarchy.js';
import { compileTemplate } from './template-compiler.js';
import { getComponentIdFromElement, toCssName } from './utils/dom-helpers.js';

/**
 * Collect all public variables from a component instance.
 * Variables are non-private (#) public class fields.
 * Autocalculated getters (prefixed with $) are included.
 * @param {import('./component.js').Component} instance - Component instance
 * @returns {import('./component.js').ComponentVars} Map of variable names to values
 */
export function collectVars(instance) {
    const vars = /** @type {import('./component.js').ComponentVars} */ (
        /** @type {unknown} */ ({})
    );
    for (const key of Object.keys(instance)) {
        /** @type {Object<string, unknown>} */ (vars)[key] =
            /** @type {Object<string, unknown>} */ (instance)[key];
    }
    // Collect $ getters
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
            if (key.startsWith('$') && typeof descriptor.get === 'function') {
                /** @type {Object<string, unknown>} */ (vars)[key] =
                    /** @type {Object<string, unknown>} */ (instance)[key];
            }
        }
        proto = Object.getPrototypeOf(proto);
    }
    return vars;
}

/**
 * Class constructor for a Component.
 * @typedef {import('./component.js').ComponentConstructor} ComponentConstructor
 */
/**
 * Variables map passed to a component.
 * @typedef {import('./component.js').ComponentVars} ComponentVars
 */

/**
 * InstanceRegistry - Manages component instances and their lifecycle
 */
export class InstanceRegistry {
    /**
     * Create a new InstanceRegistry
     * @param {import('./renderer.js').Renderer} renderer - The renderer instance
     * @param {import('./template-store.js').TemplateStore} templateStore - The template store
     * @param {string} appName - The application name
     * @param {import('./persistence.js').Persistence} [persistence] - Optional persistence layer
     */
    constructor(renderer, templateStore, appName, persistence) {
        this._renderer = renderer;
        this._templateStore = templateStore;
        this._appName = appName;
        this.persistence = persistence;

        /**
         * Map of all active component instances keyed by component code.
         * @type {Map<string, import('./symbols.js').RegistryEntry>}
         */
        this._instances = new Map();
        /**
         * Set of component codes representing the roots of the component tree.
         * @type {Set<string>}
         */
        this._roots = new Set();
        /**
         * The reactor orchestrating this registry.
         * @type {import('./reactor.js').Reactor|null}
         */
        this._reactor = null;

        /**
         * Map of pre-registered component constructors.
         * @type {Map<string, ComponentConstructor>}
         */
        this._componentClasses = new Map();

        // Register built-in components
        this.registerComponent('FuseWire/Lazy', Lazy);
        this._templateStore.set('FuseWire/Lazy', {
            version: 'builtin',
            htmlCode: '((child))',
        });
        this._templateStore.setCompiled(
            'FuseWire/Lazy',
            compileTemplate('((child))', '', this._appName),
        );

        this.registerComponent('FuseWire/ErrorBoundary', ErrorBoundary);
        this._templateStore.set('FuseWire/ErrorBoundary', {
            version: 'builtin',
            htmlCode: '((child))',
        });
        this._templateStore.setCompiled(
            'FuseWire/ErrorBoundary',
            compileTemplate('((child))', '', this._appName),
        );

        this.registerComponent('FuseWire/Root', Root);
        this._templateStore.set('FuseWire/Root', {
            version: 'builtin',
            htmlCode: '((portal))((app))',
        });
        this._templateStore.setCompiled(
            'FuseWire/Root',
            compileTemplate('((portal))((app))', '', this._appName),
        );

        this.registerComponent('FuseWire/PortalHost', PortalHost);
        this._templateStore.set('FuseWire/PortalHost', {
            version: 'builtin',
            htmlCode: '<div fw-each="child in children">((child))</div>',
        });
        this._templateStore.setCompiled(
            'FuseWire/PortalHost',
            compileTemplate('<div fw-each="child in children">((child))</div>', '', this._appName),
        );

        this.registerComponent('FuseWire/PortalChild', PortalChild);
        this._templateStore.set('FuseWire/PortalChild', {
            version: 'builtin',
            htmlCode: '',
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
        const ComponentClass = await this._loadComponentClass(
            ref.componentName ||
                /** @type {ComponentConstructor} */ (ref.constructor).componentName,
        );

        // Ensure template is loaded so we can read its version
        const componentName =
            ref.componentName ||
            /** @type {ComponentConstructor} */ (ref.constructor).componentName;
        const version = await this._ensureTemplate(componentName);
        const componentId = new ComponentId(componentName, ref.componentId, version);

        const vars =
            ref instanceof Child ? { ...ref.vars } : collectVars(/** @type {Component} */ (ref));

        const instance = await this.create(componentId, ComponentClass, vars, container, {
            deferHydration,
            routeSegment,
        });

        // If a pre-configured Component instance was passed, wire any events it might have
        if (!(ref instanceof Child)) {
            // Components don't buffer events like Child refs, but they might need state transfer.
            // But since we just collected all public vars and merged them via create(), we're good.
        }

        return instance;
    }

    /**
     * Create a new component instance.
     *
     * Wires all framework state on the instance via Symbol keys:
     *   - COMPONENT_ID    → ComponentId object (name, id, version, code)
     *   - REGISTRY_ENTRY  → shared entry object (container, parent) — same object stored in the registry
     *   - CONSOLE         → pre-built console wrapper with component context
     * @param {ComponentId} componentId - Unique component identifier
     * @param {ComponentConstructor} ComponentClass - The component class constructor
     * @param {ComponentVars} vars - Initial component variables
     * @param {HTMLElement} container - DOM container element
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
        this.assertComponentDoesNotExist(code);

        // Add component scope class to container
        container.classList.add(toCssName(componentId.name));

        const instance = new ComponentClass();

        // Snapshot static route defaults before state restoration and init().
        // By capturing the baseline before init(), any dynamic state loaded from
        // a datasource inside init() will correctly register as a deviation from
        // the default and be serialized into the URL. The router omits unchanged properties.
        const routeState = instance.routeState();
        if (routeState && typeof routeState === 'object') {
            instance[ROUTE_DEFAULTS] = { ...routeState };

            // ARCHITECTURAL ENHANCEMENT: If this is a pass-through layout (routeState is {}),
            // it should get a peek at the next segment in the path so it can
            // decide which routed child to instantiate.
            if (
                Object.keys(routeState).length === 0 &&
                !routeSegment &&
                this._reactor &&
                this._reactor.router
            ) {
                routeSegment = this._reactor.router.peekSegment();
            }
        }

        // Check state store for previously captured state
        let previousState = null;
        if (this.persistence) {
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
        } else {
            Object.assign(instance, vars);
        }

        // Build registry entry — the single source of truth for container/parent.
        // The component holds a reference to this same object via REGISTRY_ENTRY,
        // so updates here are immediately visible through the getters.
        // needsHydration is set early so _mountChild can check it during render().
        const entry = {
            instance,
            container,
            parent: /** @type {import('./component-id.js').ComponentId|null} */ (null),
            children: /** @type {Map<string, import('./component-id.js').ComponentId>|null} */ (
                null
            ),
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
     * @param {ComponentId|string} componentId - Component identifier or code string (e.g., 'Counter#main')
     * @returns {Component|null} The component instance or null if not found
     */
    get(componentId) {
        const code = typeof componentId === 'string' ? componentId : componentId.code;
        const entry = this._instances.get(code);
        return entry ? entry.instance : null;
    }

    /**
     * Check if a component is registered
     * @param {ComponentId|string} componentId - Component identifier or code string
     * @returns {boolean} True if the component exists in the registry
     */
    has(componentId) {
        const code = typeof componentId === 'string' ? componentId : componentId.code;
        return this._instances.has(code);
    }

    /**
     * Assert that a component does not already exist in the registry.
     * Throws a descriptive developer error if it does.
     * @param {ComponentId|string} componentId - Component identifier
     */
    assertComponentDoesNotExist(componentId) {
        const code = typeof componentId === 'string' ? componentId : componentId.code;
        if (this._instances.has(code)) {
            throw new Error(
                `Developer Error: Component "${code}" already exists or is currently being created. ` +
                    `createChild() must only be called once per component instance. To update an existing component, mutate its properties directly.`,
            );
        }
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
            const updateResult = instance.update(newVars, false, routeSegment);
            if (updateResult instanceof Promise) {
                await updateResult;
            }

            // Re-render
            instance[LIFECYCLE_ACTIVE] = 'render';
            await this.render(componentId);

            // Call afterRender hook
            if (!entry.needsHydration) {
                instance[LIFECYCLE_ACTIVE] = 'afterRender';
                instance.afterRender();
            }
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
        const vars = collectVars(instance);

        // Call destroy hook — capture return value as extra state
        const extraState = /** @type {object|null} */ (
            /** @type {unknown} */ (instance.destroy())
        ) || null;

        // Store captured state in the Reactor's persistence module
        if (this.persistence) {
            this.persistence.save(code, { vars, extraState });
        }

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

        // Replace new Child markers with live instances and replay events for ALL existing children,
        // even if they are currently hidden from the template. This ensures their event listeners
        // are correctly wired before any hydration or background processes emit events.
        for (const [childCode, decl] of declarations) {
            const existingChildEntry = this._instances.get(childCode);
            // Only replace if the instance is fully initialized (eager creation is complete)
            if (
                existingChildEntry &&
                decl instanceof Child &&
                !decl._replaced &&
                (!decl._creationPromise ||
                    existingChildEntry.instance[LIFECYCLE_ACTIVE] === null ||
                    existingChildEntry.instance[LIFECYCLE_ACTIVE] === 'afterRender')
            ) {
                this._replaceRefInVars(instance, decl, existingChildEntry.instance);
                decl._replayBufferedEvents(existingChildEntry.instance);
                decl._replaced = true;
            }
        }

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
        // their mount points into the variables so the template engine
        // can find them if they use generic portals.
        // (In Phase 1, portals are handled explicitly by PortalHost).

        const compiledTpl = /** @type {import('./template-compiler.js').CompiledTemplate} */ (
            /** @type {unknown} */ (compiled)
        );

        const childMountPoints = this._renderer.render(
            container,
            compiledTpl,
            vars,
            componentId,
            constants,
        );

        // Update entry with discovered child mapping
        entry.children = currentChildren;

        // Detect eagerly-created children that were never mounted.
        // This means createChild() was called but the template has no ((varName))
        // mount point — the child is silently orphaned with no events, no hydration,
        // and no parent link. This is always a developer mistake.
        // Framework built-in components (FuseWire/*) are excluded because they
        // manage their own children internally (e.g. ErrorBoundary holds a
        // fallback child that is only mounted when an error occurs).
        if (!componentId.name.startsWith('FuseWire/')) {
            let mountedCodes = null;
            for (const [, decl] of declarations) {
                if (decl instanceof Child && decl._creationPromise && !decl._replaced) {
                    if (!mountedCodes) {
                        mountedCodes = new Set(
                            childMountPoints
                                .map((el) => {
                                    const id = getComponentIdFromElement(el);
                                    return id ? id.code : null;
                                })
                                .filter(Boolean),
                        );
                    }
                    if (mountedCodes.has(decl.toComponentId().code)) {
                        continue; // It was mounted, so it's valid
                    }

                    // Check if the component was intentionally hidden by an fw-if condition.
                    // If the original template contains the placeholder, it's valid.
                    let varName = null;
                    for (const key of Object.keys(instance)) {
                        if (
                            instance[key] === decl ||
                            (Array.isArray(instance[key]) && instance[key].includes(decl))
                        ) {
                            varName = key;
                            break;
                        }
                    }
                    if (
                        varName &&
                        (template.htmlCode.includes(`((${varName}))`) ||
                            template.htmlCode.match(new RegExp(`\\b${varName}\\b`)))
                    ) {
                        continue; // Hidden by conditional rendering, this is fine
                    }

                    throw new Error(
                        `Component "${componentId.code}": child "${decl.toComponentId().code}" was created via createChild() but not referenced in the template. The child will not be mounted.`,
                    );
                }
            }
        }

        // Phase 1: Wait for all eagerly-created children concurrently
        const eagerPromises = [];
        for (const mountPoint of childMountPoints) {
            const childId = getComponentIdFromElement(mountPoint);
            if (childId) {
                const ref = declarations.get(childId.code);
                if (ref && ref instanceof Child && ref._creationPromise) {
                    eagerPromises.push(ref._creationPromise);
                }
            }
        }
        if (eagerPromises.length > 0) {
            // Use allSettled so that if a child fails to create (e.g. throws in init),
            // it doesn't abort the entire parent render pass. The failure will be
            // caught and handled by ErrorBoundary mechanisms during _mountChild.
            await Promise.allSettled(eagerPromises);
        }

        // Phase 2: Perform all DOM node transfers synchronously.
        // Doing this in a tight synchronous loop prevents the browser from scheduling
        // rendering frames (Layout recalculations) between partial DOM updates,
        // eliminating massive layout thrashing in WebKit when mounting large grids.
        for (const mountPoint of childMountPoints) {
            const childId = getComponentIdFromElement(mountPoint);
            if (childId) {
                const childCode = childId.code;
                const ref = declarations.get(childCode);

                // Handle eagerly-created children
                if (ref && ref instanceof Child && ref._creationPromise && ref._detachedContainer) {
                    mountPoint.innerHTML = '';
                    const detached = ref._detachedContainer;
                    while (detached.firstChild) {
                        mountPoint.appendChild(detached.firstChild);
                    }
                    ref._detachedContainer = null;
                } else {
                    // Handle existing children that need DOM teleportation
                    const existingEntry = this._instances.get(childCode);
                    if (
                        existingEntry &&
                        existingEntry.container &&
                        existingEntry.container !== mountPoint
                    ) {
                        mountPoint.innerHTML = '';
                        const detached = existingEntry.container;
                        while (detached.firstChild) {
                            mountPoint.appendChild(detached.firstChild);
                        }
                        existingEntry.container = mountPoint;
                    }
                }
            }
        }

        // Phase 3: Run the rest of the lifecycle (routing, hydration) concurrently
        const mountPromises = childMountPoints.map((mountPoint) =>
            this._mountChild(mountPoint, instance, declarations),
        );
        await Promise.all(mountPromises);

        // Clean up orphaned component instances that were removed from the template/vars
        for (const [childCode, childId] of previousChildren) {
            if (!currentChildren.has(childCode)) {
                this.remove(childId);
            }
        }
    }

    /**
     * Mount or update a child component at a mount point.
     * @private
     * @param {HTMLElement} mountPoint - The <fw-mount> element
     * @param {Component} parentInstance - The parent component
     * @param {Map<string, Child|Component>} declarations - Child declarations collected from vars
     * @returns {Promise<void>}
     */
    async _mountChild(mountPoint, parentInstance, declarations) {
        const childId = getComponentIdFromElement(mountPoint);
        if (!childId) return;

        const childCode = childId.code;
        const ref = declarations.get(childCode) || null;

        // Check for an eagerly-created child (reference with _creationPromise)
        // This must run BEFORE the existingEntry check because eager creation
        // inserts partial entries into the registry synchronously to support recursive resolution.
        if (ref instanceof Child && ref._creationPromise) {
            return await this._attachEagerChild(ref, mountPoint, parentInstance);
        }

        // If child already exists, just update its container and re-render.
        const existingEntry = this._instances.get(childCode);

        if (existingEntry) {
            if (existingEntry.container !== mountPoint) {
                // DOM Teleportation: Physically move nodes from the old detached/orphaned container
                // to the new live mount point to preserve third-party state (CodeMirror, Canvas, etc.)
                mountPoint.innerHTML = '';
                const detached = existingEntry.container;
                while (detached.firstChild) {
                    mountPoint.appendChild(detached.firstChild);
                }

                existingEntry.container = mountPoint;
                existingEntry.parent = parentInstance[COMPONENT_ID];

                const cssName = toCssName(childId.name);
                if (!mountPoint.classList.contains(cssName)) {
                    mountPoint.classList.add(cssName);
                }

                // Re-hydrate the subtree to update container references for deeply nested children
                // whose mount points just moved physically in the DOM tree.
                await this._hydrateSubtree(childId);

                // We intentionally skip this.render(childId) because the DOM is already intact.
                // We just call afterRender to allow the component to readjust to its new layout context.
                if (typeof existingEntry.instance.afterRender === 'function') {
                    try {
                        existingEntry.instance[LIFECYCLE_ACTIVE] = 'afterRender';
                        existingEntry.instance.afterRender();
                    } catch (error) {
                        const handled = existingEntry.instance.emitCancellable('fw-error', {
                            error,
                            failedComponent: childId.name,
                        });
                        if (!handled) {
                            throw error;
                        }
                    } finally {
                        existingEntry.instance[LIFECYCLE_ACTIVE] = null;
                    }
                }
            }
            return;
        }

        // Fresh child — must have a declaration in parent's vars
        if (!ref) {
            throw new Error(
                `Child component ${childCode} not found in variables of ${parentInstance.componentCode}`,
            );
        }

        try {
            let routeSegment = null;
            if (this._reactor && this._reactor.router) {
                let routeKey = null;
                for (const key of Object.keys(parentInstance)) {
                    const val = parentInstance[key];
                    if (val === ref || (Array.isArray(val) && val.includes(ref))) {
                        routeKey = key;
                        break;
                    }
                }
                if (routeKey) {
                    routeSegment = this._reactor.router.consumeSegment(routeKey);
                }
            }

            // Eager creation was NOT started (not called during init/update)
            // Perform synchronous creation and mount
            const childInstance = await this.createFromReference(
                /** @type {Child} */ (ref),
                mountPoint,
                { routeSegment },
            );
            if (!childInstance) {
                // The component failed to create, but the error was handled (e.g. by an ErrorBoundary).
                // It will be cleaned up/replaced on the next render pass.
                return;
            }
            this._replaceRefInVars(parentInstance, /** @type {Child} */ (ref), childInstance);
            if (ref instanceof Child) {
                ref._replayBufferedEvents(childInstance);
                ref._replaced = true;
            }
            const newlyCreatedEntry = this._instances.get(childInstance.componentCode);
            if (newlyCreatedEntry) {
                newlyCreatedEntry.parent = parentInstance[COMPONENT_ID];
            }
            this._roots.delete(childInstance.componentCode);
        } catch (error) {
            let handled = false;
            if (ref instanceof Child) {
                handled = ref._emitBuffered('fw-error', {
                    error,
                    failedComponent: ref.componentName,
                });
            } else if (
                ref &&
                typeof (/** @type {Object<string, unknown>} */ (ref).emit) === 'function'
            ) {
                let bubblingPrevented = false;
                /** @type {{emit: function(string, object): void}} */ (
                    /** @type {unknown} */ (ref)
                ).emit('fw-error', {
                    error,
                    failedComponent: /** @type {{componentName: string}} */ (
                        /** @type {unknown} */ (ref)
                    ).componentName,
                    /**
                     * Prevent bubbling.
                     * @returns {void}
                     */
                    preventDefault: () => {
                        bubblingPrevented = true;
                    },
                });
                handled = bubblingPrevented;
            }
            if (handled) return;
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
     * @param {import('./route-segment.js').RouteSegment|null} routeSegment - Optional segment to pass to init()
     */
    startEagerCreation(ref, routeSegment = null) {
        const code = new ComponentId(ref.componentName, ref.componentId || '').code;

        // If the component already exists in the registry (e.g. re-render with
        // same children), skip eager creation — _mountChild will re-render it.
        if (this._instances.has(code)) {
            return;
        }
        const container = document.createElement('div');
        ref._detachedContainer = container;

        const promise = this._eagerCreate(ref, container, routeSegment);
        promise.catch((err) => {
            // Prevent unhandled promise rejections if the eager child fails but is never mounted.
            // Save the error so it can be re-thrown when attached.
            ref._creationError = err;
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
     * @param {import('./route-segment.js').RouteSegment|null} routeSegment - Optional segment to pass to init()
     * @returns {Promise<Component>} The created instance (pending hydration)
     */
    async _eagerCreate(ref, container, routeSegment = null) {
        const code = new ComponentId(ref.componentName, ref.componentId || '').code;
        try {
            return await this.createFromReference(ref, container, {
                deferHydration: true,
                routeSegment,
            });
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
     * Attach an eagerly-created child whose creation was started by startEagerCreation().
     * Transfers the DOM from the detached container to the mount point and
     * completes the hydration/afterRender lifecycle.
     * @private
     * @param {Child} ref - Component reference
     * @param {HTMLElement} mountPoint - The <fw-mount> element in the document
     * @param {Component} parentInstance - The parent component
     */
    async _attachEagerChild(ref, mountPoint, parentInstance) {
        let childInstance;
        try {
            // Wait for creation pipeline (init + render) to complete
            childInstance = await ref._creationPromise;
            if (ref._creationError) {
                throw ref._creationError;
            }
            if (!childInstance) {
                // Component creation failed but was handled
                return;
            }
            const code = childInstance.componentCode;
            const entry = this._instances.get(code);

            // Update registry entry with real parent and document container
            if (entry) {
                entry.parent = parentInstance[COMPONENT_ID];
                entry.container = mountPoint;
            }

            // Transfer rendered DOM from detached container into the real mount point.
            // (May have already been done synchronously by Phase 2 of render)
            if (ref._detachedContainer) {
                mountPoint.innerHTML = '';
                const detached = ref._detachedContainer;
                while (detached.firstChild) {
                    mountPoint.appendChild(detached.firstChild);
                }
                ref._detachedContainer = null;
            }

            // Deliver initial route segment if present (before hydration)
            if (this._reactor && this._reactor.router) {
                let routeKey = null;
                for (const key of Object.keys(parentInstance)) {
                    const val = parentInstance[key];
                    // Also check childInstance in case _replaceRefInVars was already called
                    if (
                        val === ref ||
                        val === childInstance ||
                        (Array.isArray(val) && (val.includes(ref) || val.includes(childInstance)))
                    ) {
                        routeKey = key;
                        break;
                    }
                }
                if (routeKey) {
                    const segment = this._reactor.router.consumeSegment(routeKey);
                    if (segment) {
                        // update() won't call afterRender because entry.needsHydration is true
                        await this.update(childInstance[COMPONENT_ID], {}, segment);
                    }
                }
            }

            const childId = ComponentId.fromCode(code);
            mountPoint.classList.add(toCssName(childId.name));

            // Replace reference in parent's vars with real instance
            this._replaceRefInVars(parentInstance, ref, childInstance);
            ref._replayBufferedEvents(childInstance);
            ref._replaced = true;
            this._roots.delete(code);

            // Resume lifecycle (bottom-up)
            await this._hydrateSubtree(childId);
        } catch (error) {
            // Clean up instance if it failed during hydration
            if (childInstance) {
                this.remove(childInstance[COMPONENT_ID]);
            }
            const handled = ref._emitBuffered('fw-error', {
                error,
                failedComponent: ref.componentName,
            });
            if (handled) return;
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
                    // Children declared in init() but omitted from the template (e.g. via fw-if)
                    // remain in detached, unmounted containers with parentNode === null.
                    // We must skip hydrating them until they are actually rendered and mounted.
                    if (childEntry.container && childEntry.container.parentNode === null) {
                        continue;
                    }
                    const escapedId = childEntry.instance.componentId.replace(/["\\]/g, '\\$&');
                    const escapedParent = componentId.code.replace(/["\\]/g, '\\$&');
                    const selector = `[data-fusewire-id="${escapedId}"][data-fusewire-parent-id="${escapedParent}"]`;
                    const newContainer = entry.container.querySelector(selector);
                    if (newContainer) {
                        childEntry.container = /** @type {HTMLElement} */ (newContainer);
                    }
                    await this._hydrateSubtree(childEntry.instance[COMPONENT_ID]);
                }
            }
        }

        if (entry.needsHydration) {
            const { instance } = entry;
            try {
                // Call hydrate hook
                instance[LIFECYCLE_ACTIVE] = 'hydrate';
                instance.hydrate();

                // Call afterRender hook
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
                // Notify listeners that component is ready
                instance.emit('fw-ready', instance);
            }
        }
    }

    /**
     * Search component vars for a Child reference and replace it with
     * the real Component instance.
     * @private
     * @param {Component} parentInstance - Parent instance whose vars to search
     * @param {Child} ref - Reference to find
     * @param {Component} instance - Real instance to replace with
     */
    _replaceRefInVars(parentInstance, ref, instance) {
        for (const key of Object.keys(parentInstance)) {
            const value = parentInstance[key];
            if (value === ref) {
                parentInstance[key] = instance;
                ref._replaced = true;
            } else if (Array.isArray(value)) {
                const index = value.indexOf(ref);
                if (index !== -1) {
                    value[index] = instance;
                    ref._replaced = true;
                }
            }
        }
    }

    /**
     * Collect all Child declarations from a component instance's variables.
     * Used by render() to determine which children to mount/reconcile.
     * @private
     * @param {Component} instance - The component instance to scan
     * @returns {{children: Map<string, import('./component-id.js').ComponentId>, declarations: Map<string, Child|Component>}} Maps of componentCode to declaration
     */
    _collectChildComponents(instance) {
        /**
         * Map of child component codes to ComponentId objects.
         * @type {Map<string, ComponentId>}
         */
        const children = new Map(); // componentCode -> ComponentId
        /**
         * Map of child component codes to their Child/Component declarations.
         * @type {Map<string, Child|Component>}
         */
        const declarations = new Map(); // componentCode -> Child|Component reference

        /**
         * Add a declaration.
         * @param {Child|Component} value - The child or component reference
         */
        const addDecl = (value) => {
            let name;
            let id;
            if (value instanceof Child) {
                name = value.componentName;
                id = value.componentId || '';
            } else if (value instanceof Component) {
                name = /** @type {ComponentConstructor} */ (value.constructor).componentName;
                id = value.componentId || '';
            } else {
                return;
            }
            const compId = new ComponentId(name, id);
            children.set(compId.code, compId);
            declarations.set(compId.code, value);
        };

        const vars = collectVars(instance);
        for (const value of Object.values(vars)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (item instanceof Component || item instanceof Child) {
                        addDecl(item);
                    }
                }
            } else if (value instanceof Component || value instanceof Child) {
                addDecl(value);
            }
        }
        return { children, declarations };
    }
    /**
     * Load the ES module for a component class.
     * @private
     * @param {string} componentName - Component name (e.g. 'Counter')
     * @returns {Promise<ComponentConstructor>} The component class
     */
    async _loadComponentClass(componentName) {
        // Return pre-registered class if available
        const preRegistered = this._componentClasses.get(componentName);
        if (preRegistered) return preRegistered;

        if (!this._reactor) {
            throw new Error(
                `InstanceRegistry: Cannot load component ${componentName} - reactor not attached`,
            );
        }

        const url = `${this._reactor.basePath}/${componentName}.js`;
        try {
            const module = await import(url);
            // By convention, a component at 'A/B/MyComponent.js'
            // exports 'class MyComponent'.
            const className = componentName.split('/').pop();
            const ComponentClass = module[className] || module.default;

            if (!ComponentClass) {
                throw new Error(`Component class ${className} not found in ${url}`);
            }

            // Stash for future name-based resolution
            this.registerComponent(componentName, ComponentClass);
            return ComponentClass;
        } catch (error) {
            throw new Error(
                `Failed to load component class ${componentName} from ${url}: ${/** @type {Error} */ (error).message}`,
            );
        }
    }

    /**
     * Build a component-scoped console wrapper.
     * @private
     * @param {ComponentId} componentId - Component identifier
     * @returns {import('./reactor.js').ConsoleLike} Console-like object
     */
    _buildConsoleFor(componentId) {
        const reactorConsole = this._reactor.console;
        return {
            /**
             * Log a message.
             * @param {string} msg - The message
             * @param {...any} args - Additional arguments
             * @returns {void}
             */
            log: (msg, ...args) => reactorConsole.log(`[${componentId.code}] ${msg}`, ...args),
            /**
             * Log a warning.
             * @param {string} msg - The message
             * @param {...any} args - Additional arguments
             * @returns {void}
             */
            warn: (msg, ...args) => reactorConsole.warn(`[${componentId.code}] ${msg}`, ...args),
            /**
             * Log an error.
             * @param {string} msg - The message
             * @param {...any} args - Additional arguments
             * @returns {void}
             */
            error: (msg, ...args) => reactorConsole.error(`[${componentId.code}] ${msg}`, ...args),
        };
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
     * @param {import('./symbols.js').RegistryEntry} entry - Registry entry
     * @param {string} eventName - Event name to broadcast
     * @param {Array.<*>} args - Arguments forwarded to each handler
     */
    _broadcastToEntry(entry, eventName, args) {
        const { instance } = entry;
        const { PortalHost, PortalChild } = this._reactor.instanceRegistry._getBuiltins();

        // PortalHost subtrees are excluded — broadcasts reach portal children
        // only via PortalChild forwarding to prevent double-delivery
        if (PortalHost && instance instanceof PortalHost) return;

        let stopped = false;
        const events = /** @type {Object<symbol, unknown>} */ (/** @type {unknown} */ (instance))[
            EVENTS
        ];
        if (events) {
            const result =
                /** @type {{emitBroadcast: function(string, ...unknown): {errors: Error[], stopped: boolean}}} */ (
                    events
                ).emitBroadcast(eventName, ...args);
            for (const err of result.errors) {
                /** @type {{error: function(string): void}} */ (
                    /** @type {Object<symbol, unknown>} */ (/** @type {unknown} */ (instance))[
                        CONSOLE
                    ]
                ).error(`broadcast('${eventName}') listener threw: ${err.message}`);
            }
            stopped = result.stopped;
        }
        if (stopped) return;

        // Forward broadcast through PortalChild bridge to the real child
        if (PortalChild && instance instanceof PortalChild) {
            const pc = /** @type {unknown} */ (instance);
            const host = this._reactor.getPortalHostSync(
                /** @type {{portalHostId: string}} */ (pc).portalHostId,
            );
            if (host) {
                host.broadcastToChild(
                    /** @type {{getChildCode: () => string}} */ (pc).getChildCode(),
                    eventName,
                    args,
                );
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
     * Helper to get built-in classes safely.
     * @private
     * @returns {{PortalHost: any, PortalChild: any}} The builtin components
     */
    _getBuiltins() {
        // This is a bit of a hack to avoid circular dependencies in this simplified ESM structure.
        // In a full build system this would be handled differently.
        const _global =
            /** @type {{FuseWireBuiltins?: {PortalHost: unknown, PortalChild: unknown}}} */ (
                /** @type {unknown} */ (globalThis)
            );
        return {
            PortalHost: _global.FuseWireBuiltins?.PortalHost,
            PortalChild: _global.FuseWireBuiltins?.PortalChild,
        };
    }
}
