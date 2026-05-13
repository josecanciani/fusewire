import { Component } from '/js/component.js';

/**
 * Single log line rendered in the Console Panel.
 */
export class Line extends Component {
    /**
     * Log level (info, warn, error).
     * @type {string}
     */
    level = '';
    /**
     * The log message content.
     * @type {string}
     */
    message = '';
    /**
     * Duplicate message count badge.
     * @type {number}
     */
    badge = 0;
    /**
     * The source component ID that emitted the log.
     * @type {string}
     */
    source = '';
    /**
     * The formatted timestamp of the log event.
     * @type {string}
     */
    timestamp = '';
}
