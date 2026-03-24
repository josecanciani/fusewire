import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { config, updateConfig } from '../src/config.js';

describe('config', () => {
	// Store original config to restore after each test
	let originalConfig;

	beforeEach(() => {
		originalConfig = {
			fusewireTags: [...config.fusewireTags],
			logging: { ...config.logging },
		};
	});

	// Restore config after each test
	function restoreConfig() {
		config.fusewireTags = originalConfig.fusewireTags;
		config.logging = originalConfig.logging;
	}

	describe('default values', () => {
		it('has fusewireTags', () => {
			assert.deepStrictEqual(config.fusewireTags, ['((', '))']);
		});

		it('has logging enabled by default', () => {
			assert.strictEqual(config.logging.enabled, true);
		});

		it('has default log level of info', () => {
			assert.strictEqual(config.logging.level, 'info');
		});
	});

	describe('updateConfig', () => {
		it('updates fusewireTags', () => {
			updateConfig({ fusewireTags: ['{{', '}}'] });
			assert.deepStrictEqual(config.fusewireTags, ['{{', '}}']);
			restoreConfig();
		});

		it('updates logging.enabled', () => {
			updateConfig({ logging: { enabled: false } });
			assert.strictEqual(config.logging.enabled, false);
			restoreConfig();
		});

		it('updates logging.level', () => {
			updateConfig({ logging: { level: 'debug' } });
			assert.strictEqual(config.logging.level, 'debug');
			restoreConfig();
		});

		it('performs deep merge on logging', () => {
			updateConfig({ logging: { level: 'error' } });
			assert.strictEqual(config.logging.level, 'error');
			assert.strictEqual(config.logging.enabled, true); // Should still be true
			restoreConfig();
		});

		it('updates multiple properties', () => {
			updateConfig({
				fusewireTags: ['<<', '>>'],
				logging: { level: 'warn' },
			});
			assert.deepStrictEqual(config.fusewireTags, ['<<', '>>']);
			assert.strictEqual(config.logging.level, 'warn');
			restoreConfig();
		});

		it('throws if updates is not an object', () => {
			assert.throws(
				() => updateConfig(null),
				/updates must be an object/,
			);
		});

		it('throws if updates is a string', () => {
			assert.throws(
				() => updateConfig('invalid'),
				/updates must be an object/,
			);
		});

		it('allows adding new top-level properties', () => {
			updateConfig({ customProp: 'value' });
			assert.strictEqual(config.customProp, 'value');
			delete config.customProp; // Clean up
		});
	});
});
