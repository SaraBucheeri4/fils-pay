import { test, expect } from '@playwright/test';
import { expectCleanScreen, hasLoginConfiguration, loginThroughWebsite, restrictWrites, websiteUrl } from './support/website';

const origin = websiteUrl('E2E_MERCHANT_URL', 'http://168.144.66.240:5173');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Merchant website — real user journeys', () => {

  test('login presents merchant identity and keyboard-accessible credentials', async ({ page }) => {
    await page.goto(`${origin}/dashboard/login`);
    const merchant = page.getByLabel('Merchant ID', { exact: true });
    await expect(merchant).toBeVisible();
    await merchant.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  });

  test('missing merchant credentials do not issue an OTP challenge', async ({ page }) => {
    const attempts: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/auth/login') attempts.push('login');
    });
    await page.goto(`${origin}/dashboard/login`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('Merchant ID', { exact: true })).toBeFocused();
    await expect(page.getByLabel('One-time code', { exact: true })).toHaveCount(0);
    expect(attempts).toEqual([]);
  });

  for (const path of ['/dashboard/transactions', '/dashboard/payment-links', '/dashboard/settlement']) {
    test(`anonymous user is sent to login from ${path}`, async ({ page }) => {
      await page.goto(`${origin}${path}`);
      await expect(page).toHaveURL(`${origin}/dashboard/login`);
      await expect(page.getByLabel('Merchant ID', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0);
    });
  }

  test('merchant completes OTP, filters transactions, browses account and logs out', async ({ page }) => {
    test.skip(!hasLoginConfiguration('MERCHANT'), 'Set E2E_MERCHANT_ID/EMAIL/PASSWORD and a documented OTP strategy');
    test.setTimeout(150_000);
    const blockedWrites = await restrictWrites(page);
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.name));
    await test.step('password then OTP', async () => {
      await loginThroughWebsite(page, 'MERCHANT', origin);
      await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
    });
    await test.step('search and filter transactions through the website', async () => {
      const searched = page.waitForResponse(res => new URL(res.url()).pathname === '/v1/transactions' && new URL(res.url()).searchParams.get('search') === 'e2e-no-such-reference-7d32');
      await page.getByLabel('Search', { exact: true }).fill('e2e-no-such-reference-7d32');
      expect((await searched).status()).toBe(200);
      const filtered = page.waitForResponse(res => new URL(res.url()).pathname === '/v1/transactions' && new URL(res.url()).searchParams.getAll('status').includes('captured'));
      await page.getByRole('checkbox', { name: 'captured', exact: true }).check();
      expect((await filtered).status()).toBe(200);
      await expectCleanScreen(page, '.dash-error');
    });
    await test.step('browse payment links and settlements', async () => {
      const links = page.waitForResponse(res => new URL(res.url()).pathname === `/v1/merchants/${process.env.E2E_MERCHANT_ID}/payment-links` && res.request().method() === 'GET');
      await page.getByRole('link', { name: 'Payment links', exact: true }).click();
      expect((await links).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Payment links', exact: true })).toBeVisible();
      await expectCleanScreen(page, '.dash-error');
      const batches = page.waitForResponse(res => new URL(res.url()).pathname === '/v1/settlement/batches' && res.request().method() === 'GET');
      await page.getByRole('link', { name: 'Settlement', exact: true }).click();
      expect((await batches).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Settlement batches', exact: true })).toBeVisible();
      await expectCleanScreen(page, '.dash-error');
    });
    await test.step('logout prevents revisiting transactions', async () => {
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/dashboard/login`);
      await page.goto(`${origin}/dashboard/transactions`);
      await expect(page).toHaveURL(`${origin}/dashboard/login`);
    });
    expect(blockedWrites).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
});
