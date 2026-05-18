/**
 * Tracks HTML parsing context to ensure safe template interpolation.
 * Detects whether the parser is currently inside a tag, an attribute,
 * and tracks the current attribute name to identify dangerous sinks
 * (like href or inline handlers).
 */
export class HtmlContextTracker {
    /**
     * Create a new tracker with default state.
     */
    constructor() {
        this.inTag = false;
        this.inAttributeValue = false;
        this.currentAttributeName = '';
        this.quoteChar = '';
    }

    /**
     * Process a chunk of HTML text to update the current state.
     * @param {string} text - A chunk of HTML text
     */
    process(text) {
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '<' && !this.inAttributeValue) {
                this.inTag = true;
                this.currentAttributeName = '';
            } else if (char === '>' && !this.inAttributeValue) {
                this.inTag = false;
            } else if (this.inTag) {
                if (!this.inAttributeValue) {
                    if (char === '"' || char === "'") {
                        this.inAttributeValue = true;
                        this.quoteChar = char;
                    } else if (char === '=') {
                        // Attribute name is what was collected before '='
                    } else if (/[a-zA-Z-]/.test(char)) {
                        this.currentAttributeName += char;
                    } else if (/\s/.test(char)) {
                        this.currentAttributeName = '';
                    }
                } else if (char === this.quoteChar) {
                    this.inAttributeValue = false;
                    this.quoteChar = '';
                    this.currentAttributeName = '';
                }
            }
        }
    }

    /**
     * Check if the current context is inside a dangerous attribute.
     * Dangerous attributes are those that can execute JavaScript or load external resources.
     * @returns {boolean} True if the current attribute is dangerous
     */
    isDangerousAttribute() {
        if (!this.inTag) return false;

        const dangerousAttrs = ['href', 'src', 'action', 'formaction', 'data', 'background', 'on'];

        const currentLower = this.currentAttributeName.toLowerCase();
        return dangerousAttrs.some(
            (attr) => currentLower === attr || (attr === 'on' && currentLower.startsWith('on')),
        );
    }
}
