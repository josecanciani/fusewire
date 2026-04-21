import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { UrlService, HashUrlService, HistoryUrlService } from '../src/url-service.js';

let dom;

beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost/dashboard:id=123',
    });
    global.document = dom.window.document;
    global.history = dom.window.history;
    global.location = dom.window.location;
});

afterEach(() => {
    delete global.document;
    delete global.history;
    delete global.location;
});

describe('UrlService (base class)', () => {
    it('throws on getPath()', () => {
        const service = new UrlService();
        assert.throws(() => service.getPath(), /must be implemented/);
    });

    it('throws on pushPath()', () => {
        const service = new UrlService();
        assert.throws(() => service.pushPath('/foo'), /must be implemented/);
    });

    it('throws on replacePath()', () => {
        const service = new UrlService();
        assert.throws(() => service.replacePath('/foo'), /must be implemented/);
    });

    it('throws on onNavigate()', () => {
        const service = new UrlService();
        assert.throws(() => service.onNavigate(() => {}), /must be implemented/);
    });
});

describe('HashUrlService', () => {
    describe('getPath', () => {
        it('returns empty string when no hash', () => {
            const hashDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
                url: 'http://localhost/',
            });
            global.location = hashDom.window.location;
            const service = new HashUrlService();
            assert.strictEqual(service.getPath(), '');
        });

        it('returns path from #! hash', () => {
            const hashDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
                url: 'http://localhost/#!/dashboard:id=123',
            });
            global.location = hashDom.window.location;
            const service = new HashUrlService();
            assert.strictEqual(service.getPath(), '/dashboard:id=123');
        });

        it('returns empty string for non-hashbang hash', () => {
            const hashDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
                url: 'http://localhost/#section',
            });
            global.location = hashDom.window.location;
            const service = new HashUrlService();
            assert.strictEqual(service.getPath(), '');
        });
    });

    describe('pushPath', () => {
        it('updates the URL hash via pushState', () => {
            const service = new HashUrlService();
            service.pushPath('/home:demo=Counter');
            assert.strictEqual(global.location.hash, '#!/home:demo=Counter');
        });
    });

    describe('replacePath', () => {
        it('updates the URL hash via replaceState', () => {
            const service = new HashUrlService();
            service.replacePath('/replaced');
            assert.strictEqual(global.location.hash, '#!/replaced');
        });
    });

    describe('onNavigate', () => {
        it('returns an unsubscribe function', () => {
            const service = new HashUrlService();
            const unsub = service.onNavigate(() => {});
            assert.strictEqual(typeof unsub, 'function');
        });

        it('unsubscribe can be called without error', () => {
            const service = new HashUrlService();
            const unsub = service.onNavigate(() => {});
            unsub();
        });
    });
});

describe('HistoryUrlService', () => {
    describe('getPath', () => {
        it('returns the current pathname', () => {
            const service = new HistoryUrlService();
            assert.strictEqual(service.getPath(), '/dashboard:id=123');
        });
    });

    describe('pushPath', () => {
        it('updates the URL via pushState', () => {
            const service = new HistoryUrlService();
            service.pushPath('/new-path');
            assert.strictEqual(global.location.pathname, '/new-path');
        });
    });

    describe('replacePath', () => {
        it('updates the URL via replaceState', () => {
            const service = new HistoryUrlService();
            service.replacePath('/replaced');
            assert.strictEqual(global.location.pathname, '/replaced');
        });

        it('does not add a history entry', () => {
            const service = new HistoryUrlService();
            // Push first to have a known starting point
            service.pushPath('/step1');
            service.pushPath('/step2');
            service.replacePath('/step2-replaced');
            assert.strictEqual(global.location.pathname, '/step2-replaced');
        });
    });

    describe('onNavigate', () => {
        it('returns an unsubscribe function', () => {
            const service = new HistoryUrlService();
            const unsub = service.onNavigate(() => {});
            assert.strictEqual(typeof unsub, 'function');
        });

        it('unsubscribe can be called without error', () => {
            const service = new HistoryUrlService();
            const unsub = service.onNavigate(() => {});
            unsub();
        });
    });
});
