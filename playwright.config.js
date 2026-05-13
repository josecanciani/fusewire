import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/browser',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    use: {
        headless: true,
        baseURL: 'http://localhost:8001',
    },
    webServer: {
        command: 'PORT=8001 node demo-server.js',
        port: 8001,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: {},
        },
    ],
});
