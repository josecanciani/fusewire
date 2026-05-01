import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('fw-ignore directive', () => {
    test('preserves manually mutated DOM inside fw-ignore during parent re-renders', async ({ page }) => {
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', error => console.error('BROWSER ERROR:', error));
        const testHtmlPath = path.join(__dirname, '../../htdocs/test-fw-ignore.html');
        
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <script type="importmap">
                { "imports": { "fusewire": "/js/fusewire.js", "idiomorph": "/js/vendor/idiomorph.js" } }
            </script>
            <script type="module">
                import { Reactor } from '/js/reactor.js';
                import { Component } from '/js/component.js';
                
                class TestParent extends Component {
                    count = 0;
                    increment() {
                        this.count++;
                        this.react();
                    }
                }
                
                const reactor = new Reactor('testApp');
                reactor.instanceRegistry.registerComponent('TestParent', TestParent);
                reactor.instanceRegistry._templateStore.set('TestParent', {
                    htmlCode: \`
                        <div class="parent-container">
                            <span id="counter">Count: ((count))</span>
                            <button id="inc-btn" onclick="((this)).increment()">Inc</button>
                            <div id="ignored-zone" fw-ignore>
                                <span id="ignored-content">Initial</span>
                            </div>
                        </div>
                    \`,
                    cssCode: '',
                    version: 'v1'
                });
                
                reactor.start(document.getElementById('app'), 'TestParent', 'root', {});
            </script>
        </head>
        <body>
            <div id="app"></div>
        </body>
        </html>
        `;
        
        fs.writeFileSync(testHtmlPath, htmlContent);
        
        try {
            await page.goto('http://localhost:8000/test-fw-ignore.html');
            
            // Wait for initial render
            await expect(page.locator('#counter')).toHaveText('Count: 0');
            await expect(page.locator('#ignored-content')).toHaveText('Initial');
            
            // Manually mutate the DOM inside the ignored zone
            await page.evaluate(() => {
                document.getElementById('ignored-content').textContent = 'Mutated state!';
                
                // Add a new element that wasn't in the template
                const newEl = document.createElement('div');
                newEl.id = 'injected-widget';
                newEl.textContent = 'Third-party widget';
                document.getElementById('ignored-zone').appendChild(newEl);
            });
            
            // Verify mutation happened
            await expect(page.locator('#ignored-content')).toHaveText('Mutated state!');
            await expect(page.locator('#injected-widget')).toHaveText('Third-party widget');
            
            // Trigger parent re-render by clicking increment
            await page.click('#inc-btn');
            
            // Wait for the re-render text to update
            await expect(page.locator('#counter')).toHaveText('Count: 1');
            
            // Verify ignored zone preserved its mutations
            await expect(page.locator('#ignored-content')).toHaveText('Mutated state!');
            await expect(page.locator('#injected-widget')).toHaveText('Third-party widget');
            
        } finally {
            if (fs.existsSync(testHtmlPath)) {
                fs.unlinkSync(testHtmlPath);
            }
        }
    });
});
