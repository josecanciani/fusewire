import { Component } from '/js/component.js';

export class Panel extends Component {
    async hydrate() {
        this._lastKey = '';
        this._lastCount = 0;
        this._messageCount = 0;
        this._reactor.attachConsole(this);
    }

    destroy() {
        this._reactor.detachConsole(this);
    }

    log(message) {
        this._addLog('log', message);
    }

    warn(message) {
        this._addLog('warn', message);
    }

    error(message) {
        this._addLog('error', message);
    }

    _addLog(level, message) {
        this._messageCount++;
        const key = level + ':' + message;
        if (this._lastKey === key) {
            this._lastCount++;
            this.vars.logs.at(-1).update({ badge: this._lastCount });
        } else {
            this._lastKey = key;
            this._lastCount = 1;
            this.vars.logs.push(
                this.createChild('Console/Line', String(this._messageCount), { level, message, badge: '' }),
            );
            this.react();
        }
    }

    afterRender() {
        console.log('afterRender');
        const lastLog = this.componentContainer?.querySelector('.console-panel-logs')?.lastElementChild;
        if (lastLog) lastLog.scrollIntoView({ block: 'end', behavior: 'instant' });
    }

    clear() {
        this._lastKey = '';
        this._lastCount = 0;
        this._messageCount = 0;
        this.vars.logs = [];
        this.react();
    }
}
