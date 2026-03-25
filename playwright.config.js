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
        baseURL: 'http://localhost:9876',
    },
    webServer: {
        command: 'npx http-server . -p 9876 --silent',
        port: 9876,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: {},
        },
    ],
});
