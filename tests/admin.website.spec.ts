import { test, expect } from '@playwright/test';
import { expectCleanScreen, hasLoginConfiguration, loginThroughWebsite, restrictWrites, websiteUrl } from './support/website';

const origin = websiteUrl('E2E_ADMIN_URL', 'http://168.144.66.240:5174');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Admin website — real user journeys', () => {

  test('login presents accessible credential fields and supports keyboard navigation', async ({ page }) => {
    await page.goto(`${origin}/login`);
    await expect(page.getByRole('heading', { name: 'FilsPay Admin', exact: true })).toBeVisible();
    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toHaveAttribute('type', 'email');
    await email.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  });

  test('empty credentials stay on login without creating an OTP challenge', async ({ page }) => {
    const attempts: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/admin/auth/login') attempts.push('login');
    });
    await page.goto(`${origin}/login`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await expect(page.getByLabel('One-time code', { exact: true })).toHaveCount(0);
    expect(attempts).toEqual([]);
  });

  for (const path of ['/merchants', '/credits', '/settlement']) {
    test(`anonymous user is sent to login from ${path}`, async ({ page }) => {
      await page.goto(`${origin}${path}`);
      await expect(page).toHaveURL(`${origin}/login`);
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0);
    });
  }

  test('admin completes OTP, searches merchants, browses operations and logs out', async ({ page }) => {
    test.skip(!hasLoginConfiguration('ADMIN'), 'Set E2E_ADMIN_EMAIL/PASSWORD and a documented OTP strategy');
    test.setTimeout(150_000);
    const blockedWrites = await restrictWrites(page);
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.name));
    await test.step('password then OTP', async () => {
      await loginThroughWebsite(page, 'ADMIN', origin);
      await expect(page.getByRole('heading', { name: 'Merchants', exact: true })).toBeVisible();
    });
    await test.step('search the merchant directory', async () => {
      const response = page.waitForResponse(res => new URL(res.url()).pathname === '/v1/admin/merchants' && new URL(res.url()).searchParams.get('q') === 'e2e-no-such-merchant-7d32');
      await page.getByLabel('Search', { exact: true }).fill('e2e-no-such-merchant-7d32');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      expect((await response).status()).toBe(200);
      await expectCleanScreen(page, '.admin-error');
    });
    await test.step('browse operational pages without mutations', async () => {
      const credits = page.waitForResponse(res => new URL(res.url()).pathname === '/v1/admin/credits' && res.request().method() === 'GET');
      await page.getByRole('link', { name: 'Credits', exact: true }).click();
      expect((await credits).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Merchant credits', exact: true })).toBeVisible();
      await expectCleanScreen(page, '.admin-error');
      await page.getByRole('link', { name: 'Settlement ops', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Settlement ops', exact: true })).toBeVisible();
      await expectCleanScreen(page, '.admin-error');
    });
    await test.step('logout prevents revisiting protected pages', async () => {
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/login`);
      await page.goto(`${origin}/merchants`);
      await expect(page).toHaveURL(`${origin}/login`);
    });
    expect(blockedWrites).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
});
