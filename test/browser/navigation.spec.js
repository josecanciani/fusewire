import { test, expect } from '@playwright/test';

test.describe('Navigation State Restoration', () => {
    test.beforeEach(async ({ page }) => {
        // Start on the Demo page with Counter selected
        await page.goto('/#!/demo:demo=Counter');
        
        // Wait for the Editor (CodeMirror) to fully mount
        await page.waitForSelector('.cm-editor', { state: 'visible' });
    });

    test('retains CodeMirror editor using CSS toggle', async ({ page }) => {
        // Verify Editor is present initially
        const initialEditorCount = await page.locator('.cm-editor').count();
        expect(initialEditorCount).toBe(1);

        // Click the 'Docs' link in the navbar
        await page.click('text="Docs"');
        
        // Wait for the Markdown viewer to mount in Docs
        await page.waitForSelector('.markdown-body', { state: 'visible' });

        // Ensure Playground/Home is unmounted
        const demoMountCount = await page.locator('[data-fusewire-id="Playground/Home#demo"]').count();
        expect(demoMountCount).toBe(0);

        // Click the 'Playground' link to go back
        await page.click('text="Playground"');

        // Wait for Editor to reappear
        await page.waitForSelector('.cm-editor', { state: 'visible', timeout: 5000 });

        // Verify the Editor completely restored
        const restoredEditorCount = await page.locator('.cm-editor').count();
        expect(restoredEditorCount).toBe(1);
    });
});