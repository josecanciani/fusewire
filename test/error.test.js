import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Component, ErrorBoundary } from '../src/component.js';
import { ComponentId } from '../src/component-id.js';
import { Reactor } from '../src/reactor.js';
import { JSDOM } from 'jsdom';
import { StrictConsole } from './strict-console.js';

class Parent extends Component {
    errorCount = 0;
    lastErrorMsg = '';

    init() {
        this.recreateChild();
    }

    recreateChild() {
        this.boundary = this.createErrorBoundedChild(
            this.createChild(this.failingChildName, this.failId + '-' + Date.now()),
            'FallbackComponent',
        );
        this.boundary.on('error', (ctx) => {
            this.errorCount++;
            this.lastErrorMsg = ctx.error.message;
        });
        this.react();
    }
}

class FailComponent extends Component {
    badVar = '';

    async init() {
        const id = this.componentId;

        if (id.startsWith('init')) {
            throw new Error('This error was thrown intentionally inside init()');
        }

        if (id.startsWith('render')) {
            this.badVar = {
                toString() {
                    throw new Error('This error was thrown intentionally during template rendering');
                },
            };
        }
    }

    hydrate() {
        if (this.componentId.startsWith('hydrate')) {
            throw new Error('This error was thrown intentionally inside hydrate()');
        }
    }

    afterRender() {
        if (this.componentId.startsWith('afterRender')) {
            throw new Error('This error was thrown intentionally inside afterRender()');
        }
    }
}

class FallbackComponent extends Component {
    msg = '';
}

let testCounter = 0;

async function setupTestEnvironment(failId, failingHtmlCode) {
    const strictConsole = new StrictConsole();
    const reactor = new Reactor(`testapp-error-${++testCounter}`, {
        console: strictConsole,
        morphFunction: (container, htmlString) => {
            if (container && htmlString) {
                container.innerHTML = htmlString;
            }
        },
    });

    // Register mock components directly
    reactor.instanceRegistry.registerComponent('Parent', Parent);
    reactor.instanceRegistry.registerComponent('FailComponent', FailComponent);
    reactor.instanceRegistry.registerComponent('FallbackComponent', FallbackComponent);
    reactor.instanceRegistry.registerComponent('FuseWire/ErrorBoundary', ErrorBoundary);

    reactor.instanceRegistry._templateStore.set('Parent', {
        htmlCode: '<div class="parent">((boundary)) <button id="recreate-btn" onclick="((this)).recreateChild()">Recreate</button></div>',
        cssCode: '',
        version: 'v1',
    });
    reactor.instanceRegistry._templateStore.set('FailComponent', {
        htmlCode: failingHtmlCode || '<div class="failing">Should not render</div>',
        cssCode: '',
        version: 'v1',
    });
    reactor.instanceRegistry._templateStore.set('FallbackComponent', {
        htmlCode: '<div class="fallback">Fallback: ((errorMessage))</div>',
        cssCode: '',
        version: 'v1',
    });
    reactor.instanceRegistry._templateStore.set('FuseWire/ErrorBoundary', {
        htmlCode: '<div class="boundary">((child))</div>',
        cssCode: '',
        version: 'v1',
    });

    const dom = new JSDOM();
    const document = dom.window.document;
    globalThis.document = document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Element = dom.window.Element;
    globalThis.Document = dom.window.Document;

    const container = document.createElement('div');

    return { reactor, container, dom, strictConsole };
}

describe('ErrorBoundary complete flow', () => {
    it('Should correctly swap and render the fallback when eager creation fails in init()', async () => {
        const { reactor, container } = await setupTestEnvironment('init');

        await reactor.start(container, 'Parent', 'root', { failingChildName: 'FailComponent', failId: 'init' });
        await new Promise((r) => setTimeout(r, 50)); // drain loop

        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside init()'), 'Fallback not found in DOM');
    });

    it('Should correctly swap and render the fallback when creation fails in hydrate()', async () => {
        const { reactor, container } = await setupTestEnvironment('hydrate');

        await reactor.start(container, 'Parent', 'root', { failingChildName: 'FailComponent', failId: 'hydrate' });
        await new Promise((r) => setTimeout(r, 50));

        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside hydrate()'), 'Fallback not found in DOM');
    });

    it('Should correctly swap and render the fallback when creation fails during render', async () => {
        const { reactor, container } = await setupTestEnvironment('render', '<div class="failing">((badVar))</div>');

        await reactor.start(container, 'Parent', 'root', { failingChildName: 'FailComponent', failId: 'render' });
        await new Promise((r) => setTimeout(r, 50));

        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally during template rendering'), 'Fallback not found in DOM');
    });

    it('Should correctly swap and render the fallback when creation fails in afterRender()', async () => {
        const { reactor, container } = await setupTestEnvironment('afterRender');

        await reactor.start(container, 'Parent', 'root', { failingChildName: 'FailComponent', failId: 'afterRender' });
        await new Promise((r) => setTimeout(r, 50));

        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside afterRender()'), 'Fallback not found in DOM');
    });

    it('Should keep showing the fallback and emitting errors when recreating an error-throwing child after the fact', async () => {
        const { reactor, container, dom } = await setupTestEnvironment('init');

        await reactor.start(container, 'Parent', 'root', { failingChildName: 'FailComponent', failId: 'init' });
        await new Promise((r) => setTimeout(r, 50));

        const parentInstance = reactor.instanceRegistry.get(new ComponentId('Parent', 'root'));

        assert.ok(parentInstance, 'Parent instance not found in registry');
        assert.strictEqual(parentInstance.errorCount, 1);
        assert.strictEqual(parentInstance.lastErrorMsg, 'This error was thrown intentionally inside init()');
        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside init()'), 'Fallback not found in DOM 1');

        const button = container.querySelector('#recreate-btn');
        assert.ok(button, 'Button missing');

        // Recreate child directly to simulate inline onclick without needing runScripts: dangerously
        parentInstance.recreateChild();
        await new Promise((r) => setTimeout(r, 50));

        assert.strictEqual(parentInstance.errorCount, 2);
        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside init()'), 'Fallback not found in DOM 2');

        // Test one more time
        parentInstance.recreateChild();
        await new Promise((r) => setTimeout(r, 50));

        assert.strictEqual(parentInstance.errorCount, 3);
        assert.ok(container.innerHTML.includes('Fallback: This error was thrown intentionally inside init()'), 'Fallback not found in DOM 3');
    });
});
