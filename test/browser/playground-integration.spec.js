import { test, expect } from '@playwright/test';

test.describe('Playground Integration', () => {
    test('State Restoration (Lazy Loading)', async ({ page }) => {
        // Navigate to Lazy Loading demo directly
        await page.goto('/#!/demo:demo=Lazy%2FLazyParent');
        
        // Wait for the simulated delay
        await page.waitForTimeout(2500);
        
        // Check it loaded
        await expect(page.locator('.lazy-demo')).toContainText('Heavy Widget Loaded!');
        
        // Navigate to docs
        await page.evaluate(() => {
            FuseWire.get('site', 'Site/Main#main').navigate('docs');
        });
        await page.waitForTimeout(1000); // Give the animation/mount some time
        
        // Navigate back to demo
        await page.evaluate(() => {
            window._navStart = Date.now();
            FuseWire.get('site', 'Site/Main#main').navigate('demo');
        });
        
        // The restoration should be immediate due to caching and state restoration
        await expect(page.locator('.lazy-demo')).toContainText('Heavy Widget Loaded!', { timeout: 2000 });
        
        const timeTaken = await page.evaluate(() => Date.now() - window._navStart);
        // It should definitely be faster than the 3000ms delay.
        expect(timeTaken).toBeLessThan(1000);
    });

    test('Multi-file Editing and Execution (Error Boundaries)', async ({ page }) => {

        // Navigate to Error Boundaries demo
        await page.goto('/#!/demo:demo=ErrorDemo%2FParent');
        
        // Wait for the files to appear in the sidebar
        const sidebarFiles = page.locator('.sidebar-container .list-group-item-file');
        await expect(sidebarFiles).toHaveCount(6, { timeout: 5000 }); // Parent js/html, FailComponent js/html, Fallback js/html
        
        // Ensure the default file is opened (ErrorDemo/Parent/js)
        await expect(page.locator('.editor-tab.active')).toContainText('ErrorDemo/Parent.js');
        
        // Ensure the demo is running correctly by verifying the presence of "1. Fails in init()"
        await expect(page.locator('h2')).toContainText('Error Boundaries & Fallbacks');
        
        // Click the Run button
        await page.locator('.run-btn').click();
        
        // Verify the demo hasn't broken and the fallback didn't hijack the UI due to the TemplateStore overwrite bug
        await expect(page.locator('h2')).toContainText('Error Boundaries & Fallbacks', { timeout: 2000 });
        
        // The specific failed component boundaries should still show their "Load count: 1" and "Retry" buttons
        await expect(page.locator('button', { hasText: 'Retry' })).toHaveCount(4);
    });
});
