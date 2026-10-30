import { test, expect } from '@playwright/test';
import { loadAccounts, rampMs, rounds, userCount } from './support/load-settings';
import { websiteUrl } from './support/website';

const accounts = loadAccounts();
const mode = accounts ? 'authenticated' : 'anonymous';
// The dedicated config opts into concurrency; an ordinary suite run excludes
// these scenarios so it cannot accidentally start a load run.
const enabled = process.env.E2E_RUN_LOAD === 'true';

for (let index = 0; index < userCount; index++) {
  const account = accounts?.[index];
  const plane = account?.plane ?? (index % 2 === 0 ? 'admin' : 'merchant');
  const admin = plane === 'admin';
  const origin = admin
    ? websiteUrl('E2E_ADMIN_URL', 'http://168.144.66.240:5174')
    : websiteUrl('E2E_MERCHANT_URL', 'http://168.144.66.240:5173');
  const loginPath = admin ? '/login' : '/dashboard/login';
  const scenarios = admin
    ? [['/merchants', 'Merchants'], ['/credits', 'Merchant credits'], ['/settlement', 'Settlement ops']]
    : [['/dashboard/transactions', 'Transactions'], ['/dashboard/payment-links', 'Payment links'], ['/dashboard/settlement', 'Settlement batches']];

  test(`${mode} ${plane} user ${index + 1}`, async ({ browser }, testInfo) => {
    test.skip(!enabled || testInfo.config.metadata.concurrentWebsiteLoad !== true,
      'Use tests/load.config.ts and explicitly set E2E_RUN_LOAD=true');
    // Stagger starts instead of generating one sudden burst of navigation.
    await new Promise(resolve => setTimeout(resolve, index * rampMs));
    const context = await browser.newContext({ storageState: account?.storageState, serviceWorkers: 'block' });
    const samples: Array<{ path: string; elapsedMs: number }> = [];
    const failures: string[] = [];
    await context.route('**/v1/**', async route => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        failures.push('Unexpected API write blocked');
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`Browser error: ${error.name}`));
    page.on('requestfailed', request => {
      if (new URL(request.url()).pathname.startsWith('/v1/')) failures.push(`API network failure at ${new URL(request.url()).pathname}`);
    });
    page.on('response', response => {
      if (new URL(response.url()).pathname.startsWith('/v1/') && response.status() >= 400) {
        const expectedAnonymousCheck = !account && response.status() === 401 && /\/auth\/me$/.test(new URL(response.url()).pathname);
        if (!expectedAnonymousCheck) failures.push(`API status ${response.status()} at ${new URL(response.url()).pathname}`);
      }
    });
    try {
      if (account) {
        const me = await context.request.get(`${origin}${admin ? '/v1/admin/auth/me' : '/v1/auth/me'}`);
        expect(me.status(), 'Stored test session must be valid; no anonymous fallback').toBe(200);
      }
      for (let round = 0; round < rounds; round++) {
        for (const [path, heading] of scenarios) {
          await test.step(`round ${round + 1}: browse ${path}`, async () => {
            const start = performance.now();
            const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
            expect(response?.ok(), 'Website document should load successfully').toBe(true);
            if (account) {
              await expect(page).toHaveURL(`${origin}${path}`);
              await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
              await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
            } else {
              await expect(page).toHaveURL(`${origin}${loginPath}`);
              await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
              await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
            }
            await page.waitForLoadState('networkidle');
            await expect(page.locator('.admin-error, .dash-error')).toHaveCount(0);
            samples.push({ path, elapsedMs: Math.round(performance.now() - start) });
            // Small think time between user actions; this is a browser journey,
            // not an unbounded HTTP throughput or capacity benchmark.
            await new Promise(resolve => setTimeout(resolve, 300));
          });
        }
      }
      expect(failures).toEqual([]);
    } finally {
      await testInfo.attach('navigation-timings', {
        body: JSON.stringify({ user: index + 1, plane, mode, samples, failures }, null, 2),
        contentType: 'application/json',
      });
      await context.close();
    }
  });
}
