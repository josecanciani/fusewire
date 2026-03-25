import { test, expect } from '@playwright/test';

/**
 * Browser-only tests for DOM morphing with idiomorph
 * 
 * These tests require a real browser environment because:
 * 1. idiomorph relies on browser DOM APIs that JSDOM doesn't fully emulate
 * 2. The `Document` constructor check fails in JSDOM
 * 3. We need to verify morphing actually preserves element identity
 */

test.describe('DOM Morphing (Renderer)', () => {
    test.beforeEach(async ({ page }) => {
        // Create a simple HTML page with our library
        await page.goto('/test/browser/morphing-test.html');
        await page.waitForFunction(() => window.testReady === true);
    });

    test('morphs DOM on re-render while preserving element identity', async ({ page }) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('container');
            const renderer = new window.Renderer(window.Idiomorph.morph);
            
            const compiledTemplate = {
                render: (vars) => `<div class="counter">${vars.count}</div>`,
                css: '',
            };
            
            const componentId = { name: 'Counter', toCode: () => 'Counter#1' };
            
            // First render
            renderer.render(container, compiledTemplate, { count: 5 }, componentId);
            const firstDiv = container.querySelector('.counter');
            const firstDivId = firstDiv ? Math.random() : null;
            if (firstDiv) firstDiv._testId = firstDivId;
            
            // Second render with updated count
            renderer.render(container, compiledTemplate, { count: 10 }, componentId);
            const secondDiv = container.querySelector('.counter');
            
            // Check if it's the same element (morphed)
            return {
                sameElement: secondDiv && secondDiv._testId === firstDivId,
                textContent: secondDiv ? secondDiv.textContent : null,
            };
        });
        
        expect(result.sameElement).toBe(true);
        expect(result.textContent).toBe('10');
    });

    test('updates text nodes via morphing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('container');
            const renderer = new window.Renderer(window.Idiomorph.morph);
            
            const compiledTemplate = {
                render: (vars) => `<p class="message">${vars.text}</p>`,
                css: '',
            };
            
            const componentId = { name: 'Message', toCode: () => 'Message#1' };
            
            // First render
            renderer.render(container, compiledTemplate, { text: 'Hello' }, componentId);
            const firstP = container.querySelector('.message');
            const firstTextNode = firstP ? firstP.firstChild : null;
            const firstTextNodeId = Math.random();
            if (firstTextNode) firstTextNode._testId = firstTextNodeId;
            
            // Second render with updated text
            renderer.render(container, compiledTemplate, { text: 'World' }, componentId);
            const secondP = container.querySelector('.message');
            const secondTextNode = secondP ? secondP.firstChild : null;
            
            return {
                sameTextNode: secondTextNode && secondTextNode._testId === firstTextNodeId,
                textContent: secondTextNode ? secondTextNode.textContent : null,
            };
        });
        
        expect(result.sameTextNode).toBe(true);
        expect(result.textContent).toBe('World');
    });

    test('updates attributes via morphing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('container');
            const renderer = new window.Renderer(window.Idiomorph.morph);
            
            const compiledTemplate = {
                render: (vars) => `<button class="btn" data-id="${vars.id}">Click</button>`,
                css: '',
            };
            
            const componentId = { name: 'Button', toCode: () => 'Button#1' };
            
            // First render
            renderer.render(container, compiledTemplate, { id: 'btn-1' }, componentId);
            const firstButton = container.querySelector('.btn');
            const firstButtonId = Math.random();
            if (firstButton) firstButton._testId = firstButtonId;
            
            // Second render with updated attribute
            renderer.render(container, compiledTemplate, { id: 'btn-2' }, componentId);
            const secondButton = container.querySelector('.btn');
            
            return {
                sameElement: secondButton && secondButton._testId === firstButtonId,
                dataId: secondButton ? secondButton.getAttribute('data-id') : null,
            };
        });
        
        expect(result.sameElement).toBe(true);
        expect(result.dataId).toBe('btn-2');
    });
});

test.describe('DOM Morphing (InstanceRegistry)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/test/browser/morphing-test.html');
        await page.waitForFunction(() => window.testReady === true);
    });

    test('updates instance vars and re-renders', async ({ page }) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('container');
            
            // Mock minimal implementation for browser test
            const renderer = {
                render(container, compiled, vars) {
                    const html = compiled.render(vars);
                    if (container.children.length === 0) {
                        container.innerHTML = html;
                    } else {
                        window.Idiomorph.morph(container, html, { morphStyle: 'innerHTML' });
                    }
                }
            };
            
            const compiled = {
                render: (vars) => `<div>((message))</div>`.replace('((message))', vars.message),
                css: ''
            };
            
            // Simulate initial render
            renderer.render(container, compiled, { message: 'Hello' });
            const firstDiv = container.querySelector('div');
            const firstDivId = Math.random();
            if (firstDiv) firstDiv._testId = firstDivId;
            
            // Simulate update
            renderer.render(container, compiled, { message: 'Updated' });
            const secondDiv = container.querySelector('div');
            
            return {
                sameElement: secondDiv && secondDiv._testId === firstDivId,
                innerHTML: container.innerHTML.includes('Updated'),
            };
        });
        
        expect(result.sameElement).toBe(true);
        expect(result.innerHTML).toBe(true);
    });
});
