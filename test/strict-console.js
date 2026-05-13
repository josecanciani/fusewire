/**
 * StrictConsole — a test helper that captures console.warn() and console.error()
 * calls, and fails if any unexpected ones appear.
 *
 * Usage:
 *
 *   const strict = new StrictConsole();
 *   const reactor = new Reactor('app', { console: strict });
 *   // ... test code ...
 *   strict.assertClean();   // throws if unexpected warn/error calls occurred
 *
 * When a test intentionally triggers a warning or error:
 *
 *   strict.expectWarning(/react\(\) called during init/);
 *   // ... trigger the warning ...
 *   strict.assertClean();   // passes — warning was expected
 *
 * assertClean() also fails if an expected pattern was never matched,
 * catching stale expectations when the underlying code changes.
 */

export class StrictConsole {
    constructor() {
        /** @type {Array<Array<*>>} */
        this._warnings = [];
        /** @type {Array<Array<*>>} */
        this._errors = [];
        /** @type {Array<{pattern: RegExp, matched: boolean}>} */
        this._expectedWarnings = [];
        /** @type {Array<{pattern: RegExp, matched: boolean}>} */
        this._expectedErrors = [];
    }

    /**
     * No-op log handler (informational messages are not failure signals)
     */
    log() { }

    /**
     * Capture a warning call
     * @param  {...*} args - Warning arguments
     */
    warn(...args) {
        this._warnings.push(args);
    }

    /**
     * Capture an error call
     * @param  {...*} args - Error arguments
     */
    error(...args) {
        this._errors.push(args);
    }

    /**
     * Declare that a warning matching the given pattern is expected.
     * The pattern is tested against the string representation of the first argument.
     * @param {RegExp} pattern - Pattern to match against the warning message
     */
    expectWarning(pattern) {
        this._expectedWarnings.push({ pattern, matched: false });
    }

    /**
     * Declare that an error matching the given pattern is expected.
     * The pattern is tested against the string representation of the first argument.
     * @param {RegExp} pattern - Pattern to match against the error message
     */
    expectError(pattern) {
        this._expectedErrors.push({ pattern, matched: false });
    }

    /**
     * Extract the message string from a console argument.
     * Handles both plain strings and LogMessage objects (which have a .message property).
     * @param {*} arg - The first argument passed to warn() or error()
     * @returns {string} The message string
     */
    _toMessageString(arg) {
        if (arg && typeof arg.message === 'string') {
            return arg.message;
        }
        return String(arg);
    }

    /**
     * Assert that no unexpected warnings or errors were logged,
     * and that every expected pattern was matched at least once.
     * Throws an AssertionError-style Error on failure.
     */
    assertClean() {
        // Match warnings against expected patterns.
        // Each expectation can only match one warning (prefer unmatched expectations).
        const unexpectedWarnings = [];
        for (const args of this._warnings) {
            const msg = args.map((a) => this._toMessageString(a)).join(' ');
            const match = this._expectedWarnings.find(
                (e) => !e.matched && e.pattern.test(msg),
            );
            if (match) {
                match.matched = true;
            } else {
                unexpectedWarnings.push(msg);
            }
        }

        // Match errors against expected patterns.
        const unexpectedErrors = [];
        for (const args of this._errors) {
            const msg = args.map((a) => this._toMessageString(a)).join(' ');
            const match = this._expectedErrors.find(
                (e) => !e.matched && e.pattern.test(msg),
            );
            if (match) {
                match.matched = true;
            } else {
                unexpectedErrors.push(msg);
            }
        }

        // Check for unmatched expectations
        const unmatchedWarnings = this._expectedWarnings
            .filter((e) => !e.matched)
            .map((e) => e.pattern.toString());
        const unmatchedErrors = this._expectedErrors
            .filter((e) => !e.matched)
            .map((e) => e.pattern.toString());

        const problems = [];

        if (unexpectedWarnings.length > 0) {
            problems.push(
                `Unexpected warnings (${unexpectedWarnings.length}):\n` +
                unexpectedWarnings.map((m) => `  warn: ${m}`).join('\n'),
            );
        }
        if (unexpectedErrors.length > 0) {
            problems.push(
                `Unexpected errors (${unexpectedErrors.length}):\n` +
                unexpectedErrors.map((m) => `  error: ${m}`).join('\n'),
            );
        }
        if (unmatchedWarnings.length > 0) {
            problems.push(
                `Expected warnings never triggered (${unmatchedWarnings.length}):\n` +
                unmatchedWarnings.map((p) => `  expected: ${p}`).join('\n'),
            );
        }
        if (unmatchedErrors.length > 0) {
            problems.push(
                `Expected errors never triggered (${unmatchedErrors.length}):\n` +
                unmatchedErrors.map((p) => `  expected: ${p}`).join('\n'),
            );
        }

        if (problems.length > 0) {
            throw new Error(
                'StrictConsole assertion failed:\n' + problems.join('\n'),
            );
        }
    }
}
