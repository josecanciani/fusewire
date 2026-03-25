/**
 * Base class for all FuseWire components
 */
export class Component {
	/**
	 * Component name for template resolution
	 * @type {string}
	 * @static
	 */
	static componentName = 'Component';

	/**
	 * Migrate vars when template version changes
	 * Override in subclasses to handle version migrations
	 * @static
	 * @param {Object} vars - Stored vars from previous template version
	 * @returns {Object} Migrated vars
	 */
	static migrateVars(vars) {
		// Default: no migration, return as-is
		return vars;
	}

	/**
	 * @param {string} id - Instance identifier (optional)
	 * @param {Object} vars - Component variables/data
	 */
	constructor(id = '', vars = {}) {
		this.id = id;
		this.vars = vars;
		this.container = null; // Set by framework when mounted
		this._reactor = null; // Set by framework
	}

	/**
	 * Hydrate hook - called after vars are set/updated, before render
	 * Override in subclasses for initialization logic
	 * @async
	 * @returns {Promise<void>}
	 */
	async hydrate() {
		// Override in subclasses
	}

	/**
	 * Update hook - called when vars change on existing instance
	 * @param {Object} oldVars - Previous vars object
	 */
	update(oldVars) {
		// Override in subclasses
	}

	/**
	 * Destroy hook - called when component instance is removed
	 */
	destroy() {
		// Override in subclasses
	}

	/**
	 * After render hook - called after DOM has been updated
	 */
	afterRender() {
		// Override in subclasses
	}

	/**
	 * Trigger re-render of this component
	 * @param {string} mode - Render mode ('CSR' for client-side only)
	 */
	react(mode = 'CSR') {
		this._reactor.react(this, mode);
	}
}
