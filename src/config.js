/** @typedef {{enabled?: boolean, level?: string}} LoggingConfig */
/** @typedef {{fusewireTags?: Array<string>, logging?: LoggingConfig}} FuseWireConfig */

/**
 * FuseWire Client Configuration
 * 
 * Default configuration for the FuseWire client framework.
 * Can be overridden by importing and modifying this object.
 */
export const config = {
    /**
     * Template delimiters for variable interpolation
     * Default: (( and ))
     */
    fusewireTags: ['((', '))'],

    /**
     * Logging configuration
     */
    logging: {
        /**
         * Enable/disable logging
         */
        enabled: true,

        /**
         * Log level: 'debug' | 'info' | 'warn' | 'error'
         */
        level: 'info',
    },
};

/**
 * Update configuration
 * @param {FuseWireConfig} updates - Configuration updates (merged with defaults)
 * 
 * Example:
 *   updateConfig({ logging: { level: 'debug' } })
 */
export function updateConfig(updates) {
    if (!updates || typeof updates !== 'object') {
        throw new Error('updateConfig: updates must be an object');
    }

    // Deep merge for nested objects
    if (updates.logging) {
        Object.assign(config.logging, updates.logging);
    }

    // Shallow merge for top-level properties
    Object.keys(updates).forEach((key) => {
        if (key !== 'logging') {
            config[key] = updates[key];
        }
    });
}
