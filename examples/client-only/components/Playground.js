import { Component } from '/js/component.js';

export class Playground extends Component {
    async hydrate() {
        // Set up initial state — child components are declared here
        this.vars.selectedDemo = null;
        this.vars.demoComponent = null;
        this.vars.consoleComponent = this.createChild('Console/Panel', 'console', { logs: [] });
        this.vars.htmlCode = '';
        this.vars.cssCode = '';
        this.vars.jsCode = '';
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
        this.react();
    }

    back() {
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
}
