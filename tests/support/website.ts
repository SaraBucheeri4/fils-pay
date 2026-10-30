import { expect, type Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';

export function websiteUrl(variable: string, fallback: string): string {
  const url = new URL(process.env[variable] || fallback);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${variable} must be an HTTP(S) origin without credentials`);
  }
  return url.origin;
}

export function hasLoginConfiguration(plane: 'ADMIN' | 'MERCHANT'): boolean {
  return Boolean(process.env[`E2E_${plane}_EMAIL`] && process.env[`E2E_${plane}_PASSWORD`] &&
    (plane === 'ADMIN' || process.env.E2E_MERCHANT_ID) &&
    (process.env.E2E_USE_DEV_OTP === 'true' || process.env[`E2E_${plane}_OTP_FILE`]));
}

/** Permit session operations, but prevent accidental financial/admin writes. */
export async function restrictWrites(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const sessionOperation = /^\/v1\/(?:admin\/)?auth\/(?:login|otp\/verify|logout)$/.test(path);
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || sessionOperation) {
      await route.continue();
    } else {
      blocked.push(`${request.method()} ${path}`);
      await route.abort('blockedbyclient');
    }
  });
  return blocked;
}

export async function loginThroughWebsite(page: Page, plane: 'ADMIN' | 'MERCHANT', origin: string): Promise<void> {
  await page.goto(`${origin}${plane === 'ADMIN' ? '/login' : '/dashboard/login'}`);
  if (plane === 'MERCHANT') await page.getByLabel('Merchant ID', { exact: true }).fill(process.env.E2E_MERCHANT_ID!);
  await page.getByLabel('Email', { exact: true }).fill(process.env[`E2E_${plane}_EMAIL`]!);
  await page.getByLabel('Password', { exact: true }).fill(process.env[`E2E_${plane}_PASSWORD`]!);
  const requestedAt = Date.now();
  const loginPath = plane === 'ADMIN' ? '/v1/admin/auth/login' : '/v1/auth/login';
  const response = page.waitForResponse(res => new URL(res.url()).pathname === loginPath && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  // Do not print response bodies: development responses may contain the OTP.
  expect((await response).status(), `${plane} password step failed`).toBe(200);
  await expect(page.getByLabel('One-time code', { exact: true })).toBeVisible();

  // Prove the password step alone has not opened the protected application.
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  let code = '';
  if (process.env.E2E_USE_DEV_OTP === 'true') {
    const displayedCode = page.getByText('Development code:').locator('code');
    await expect(displayedCode, 'Dev OTP mode requires a visibly exposed development code').toBeVisible();
    code = (await displayedCode.innerText()).trim();
  } else {
    const file = process.env[`E2E_${plane}_OTP_FILE`]!;
    // The operator writes the freshly received email code into this private
    // file. Never reuse an older code or connect tests to a personal inbox.
    await expect.poll(async () => {
      try {
        if ((await stat(file)).mtimeMs < requestedAt) return false;
        const candidate = (await readFile(file, 'utf8')).trim();
        if (!/^\d{4,10}$/.test(candidate)) return false;
        code = candidate;
        return true;
      } catch { return false; }
    }, { timeout: 90_000, message: `Write the fresh ${plane} OTP to its configured private file` }).toBe(true);
  }
  // Keep OTP values out of assertion messages and browser artifacts.
  if (!/^\d{4,10}$/.test(code)) throw new Error('Invalid OTP format');
  await page.getByLabel('One-time code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
}

export async function expectCleanScreen(page: Page, errorClass: string): Promise<void> {
  await expect(page.locator(errorClass)).toHaveCount(0);
  await expect(page.getByText('Unexpected Application Error!', { exact: true })).toHaveCount(0);
}
