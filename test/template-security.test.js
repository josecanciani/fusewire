import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { ComponentId } from '../src/component-id.js';
import { compileTemplate } from '../src/template-compiler.js';

// Set up JSDOM global document
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

describe('Template Compiler: Security', () => {
    it('mitigates unquoted attribute injection by escaping spaces and equals', () => {
        const template = compileTemplate('<div class=((myClass))></div>');
        const componentId = new ComponentId('Test', 'main');
        const result = template.render(
            { myClass: 'foo onclick=alert(1)' },
            componentId,
        );

        // "foo onclick=alert(1)" should have space and = escaped
        // space -> &#x20;
        // = -> &#x3d;
        assert.ok(result.includes('foo&#x20;onclick&#x3d;alert(1)'), 'Should escape space and equals sign');
        assert.ok(!result.includes(' onclick='), 'Should not contain raw attribute breakout');
    });

    it('blocks javascript: URIs in href attributes', () => {
        const template = compileTemplate('<a href=((link))>Click</a>');
        const componentId = new ComponentId('Test', 'main');
        const result = template.render(
            { link: 'javascript:alert(1)' },
            componentId,
        );

        assert.ok(result.includes('href="about:blank"') || result.includes('href=about:blank'), 'Should sanitize javascript: URI to about:blank');
    });

    it('blocks javascript: URIs in src attributes', () => {
        const template = compileTemplate('<img src=((url))>');
        const componentId = new ComponentId('Test', 'main');
        const result = template.render(
            { url: 'javascript:alert(1)' },
            componentId,
        );

        assert.ok(result.includes('src="about:blank"') || result.includes('src=about:blank'), 'Should sanitize javascript: URI in src');
    });

    it('blocks javascript: URIs in event attributes (on*)', () => {
        const template = compileTemplate('<div onclick=((code))></div>');
        const componentId = new ComponentId('Test', 'main');
        const result = template.render(
            { code: 'javascript:alert(1)' },
            componentId,
        );

        assert.ok(result.includes('onclick="about:blank"') || result.includes('onclick=about:blank'), 'Should sanitize javascript: URI in event handler');
    });

    it('handles mixed content correctly (only escapes in tags)', () => {
        const template = compileTemplate('<div>((val))</div><span title=((val))></span>');
        const componentId = new ComponentId('Test', 'main');
        const result = template.render({ val: 'foo bar' }, componentId);

        // In text content, space is NOT escaped
        assert.ok(result.includes('<div>foo bar</div>'), 'Should NOT escape spaces in text content');
        // In attribute, space IS escaped
        assert.ok(result.includes('title="foo&#x20;bar"') || result.includes('title=foo&#x20;bar'), 'Should escape spaces in attribute context');
    });

    it('sanitizes data: and vbscript: URIs', () => {
        const template = compileTemplate('<a href=((link))>Click</a>');
        const componentId = new ComponentId('Test', 'main');
        
        const dataResult = template.render({ link: 'data:text/html,<script>alert(1)</script>' }, componentId);
        assert.ok(dataResult.includes('href="about:blank"') || dataResult.includes('href=about:blank'), 'Should sanitize data: URI');

        const vbResult = template.render({ link: 'vbscript:msgbox("XSS")' }, componentId);
        assert.ok(vbResult.includes('href="about:blank"') || vbResult.includes('href=about:blank'), 'Should sanitize vbscript: URI');
    });
});
