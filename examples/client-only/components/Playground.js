import { Component } from '/js/component.js';
import { ComponentId } from '/js/component-id.js';
import { EditorView, basicSetup } from 'https://esm.sh/codemirror';
import { html } from 'https://esm.sh/@codemirror/lang-html';
import { css } from 'https://esm.sh/@codemirror/lang-css';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark';

export class Playground extends Component {
    async hydrate() {
        // Set up initial state — child components are declared here
        this.vars.selectedDemo = null;
        this.vars.demoComponent = null;
        this.vars.consoleComponent = this.createChild('Console/Panel', 'console', { logs: [] });
        this.vars.htmlCode = '';
        this.vars.cssCode = '';
        this.vars.jsCode = '';
        this._editors = {};
    }

    async selectDemo(name) {
        const demo = this.vars.demos.find((d) => d.name === name);
        if (!demo) return;
        if (this.vars.selectedDemo === name) return;

        const templateStore = this._reactor._templateStore;
        const basePath = this._reactor.basePath;

        // Ensure the demo template is in the store (engine reuses it, avoiding double-fetch)
        if (!templateStore.has(demo.name)) {
            await templateStore.fetch(demo.name, basePath);
        }
        const template = templateStore.get(demo.name);

        // JS source isn't stored by the template engine — fetch for display
        const jsCode = await fetch(`${basePath}/${demo.name}.js`).then((r) => r.text());

        this.vars.htmlCode = template.htmlCode;
        this.vars.cssCode = template.cssCode;
        this.vars.jsCode = jsCode;

        // Update sidebar highlighting
        this.vars.demos.forEach((d) => {
            d.activeClass = d.name === name ? 'active' : '';
        });

        // Create child reference — the engine auto-mounts the real component.
        // Previous demo is auto-removed by the engine when its var disappears.
        this.vars.selectedDemo = name;
        this.vars.demoComponent = this.createChild(demo.name, 'demo', demo.vars || {});
        this._destroyEditors();
        this.react();
        this._initEditors();
    }

    async runDemo() {
        const demoName = this.vars.selectedDemo;
        if (!demoName) return;

        const templateStore = this._reactor._templateStore;
        const registry = this._reactor._instanceRegistry;

        // Read current editor content
        const htmlCode = this._editors.html.state.doc.toString();
        const cssCode = this._editors.css.state.doc.toString();
        const jsCode = this._editors.js.state.doc.toString();

        try {
            // Update template in store (triggers recompilation on next render)
            const version = await templateStore._computeHash(htmlCode + cssCode);
            templateStore.set(demoName, { version, htmlCode, cssCode });

            // Re-import JS class from edited source via blob URL
            // Absolute paths like '/js/...' don't resolve from blob URLs,
            // so rewrite them to full URLs using the current origin.
            const resolvedJs = jsCode.replace(
                /(from\s+['"])\//g,
                `$1${location.origin}/`,
            );
            const blob = new Blob([resolvedJs], { type: 'text/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            try {
                const module = await import(blobUrl);
                const simpleName = demoName.includes('/') ? demoName.split('/').pop() : demoName;
                const ComponentClass = module[simpleName] || module[demoName] || module.default;
                if (ComponentClass) {
                    registry.registerComponent(demoName, ComponentClass);
                }
            } finally {
                URL.revokeObjectURL(blobUrl);
            }

            // Remove existing demo instance and recreate
            const demoId = new ComponentId(demoName, 'demo');
            if (registry.has(demoId)) {
                await registry.remove(demoId);
            }

            this._destroyEditors();
            this.vars.htmlCode = htmlCode;
            this.vars.cssCode = cssCode;
            this.vars.jsCode = jsCode;
            this.vars.demoComponent = this.createChild(demoName, 'demo', {});
            this.react();
            this._initEditors();
        } catch (err) {
            this.console.error(`Run failed: ${err.message}`);
        }
    }

    back() {
        this._destroyEditors();
        // Setting component var to null triggers auto-cleanup by the engine.
        // consoleComponent is kept — it persists across the whole session.
        this.vars.selectedDemo = null;
        this.vars.demoComponent = null;
        this.vars.htmlCode = '';
        this.vars.cssCode = '';
        this.vars.jsCode = '';
        this.vars.demos.forEach((d) => {
            d.activeClass = '';
        });
        this.react();
    }

    _initEditors() {
        const container = this.componentContainer;
        const fontTheme = EditorView.theme({
            '&': { fontSize: '12px' },
        });
        const extensions = [basicSetup, oneDark, fontTheme];

        const htmlEl = container.querySelector('.fw-editor-html');
        const cssEl = container.querySelector('.fw-editor-css');
        const jsEl = container.querySelector('.fw-editor-js');

        if (htmlEl) {
            this._editors.html = new EditorView({
                doc: this.vars.htmlCode,
                extensions: [...extensions, html()],
                parent: htmlEl,
            });
        }
        if (cssEl) {
            this._editors.css = new EditorView({
                doc: this.vars.cssCode,
                extensions: [...extensions, css()],
                parent: cssEl,
            });
        }
        if (jsEl) {
            this._editors.js = new EditorView({
                doc: this.vars.jsCode,
                extensions: [...extensions, javascript()],
                parent: jsEl,
            });
        }
    }

    _destroyEditors() {
        if (this._editors.html) {
            this.vars.htmlCode = this._editors.html.state.doc.toString();
            this._editors.html.destroy();
        }
        if (this._editors.css) {
            this.vars.cssCode = this._editors.css.state.doc.toString();
            this._editors.css.destroy();
        }
        if (this._editors.js) {
            this.vars.jsCode = this._editors.js.state.doc.toString();
            this._editors.js.destroy();
        }
        this._editors = {};
    }
}
