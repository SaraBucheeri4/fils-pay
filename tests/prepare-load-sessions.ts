import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { userCount } from './support/load-settings';
import { websiteUrl } from './support/website';

interface PrivateAccount {
  plane: 'admin' | 'merchant';
  email: string;
  password: string;
  merchantId?: string;
}

async function main(): Promise<void> {
  const file = process.env.E2E_LOAD_CREDENTIALS_FILE;
  if (!file) throw new Error('Set E2E_LOAD_CREDENTIALS_FILE to your private account JSON file');
  const raw: unknown = JSON.parse(await readFile(resolve(file), 'utf8'));
  if (!Array.isArray(raw) || raw.length !== userCount) {
    throw new Error('Private account file must have exactly E2E_LOAD_USERS entries');
  }
  const accounts: PrivateAccount[] = raw.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('plane' in entry) ||
      (entry.plane !== 'admin' && entry.plane !== 'merchant') ||
      !('email' in entry) || typeof entry.email !== 'string' || !entry.email.trim() ||
      !('password' in entry) || typeof entry.password !== 'string' || !entry.password ||
      (entry.plane === 'merchant' && (!('merchantId' in entry) || typeof entry.merchantId !== 'string' || !entry.merchantId))) {
      throw new Error('Each private account needs plane, email, password, and merchantId for merchants');
    }
    return entry as PrivateAccount;
  });
  const directory = resolve('.tmp', 'e2e', `load-${Date.now()}`);
  await mkdir(directory, { recursive: true });
  const sessions: Array<{ plane: string; storageState: string }> = [];
  const browser = await chromium.launch({ headless: false });
  try {
    // Sequential setup prevents ten indistinguishable OTP emails arriving at
    // once. OTP entry happens only in the real page, never through a bypass.
    for (let index = 0; index < accounts.length; index++) {
      const account = accounts[index];
      const admin = account.plane === 'admin';
      const origin = admin
        ? websiteUrl('E2E_ADMIN_URL', 'http://168.144.66.240:5174')
        : websiteUrl('E2E_MERCHANT_URL', 'http://168.144.66.240:5173');
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.goto(`${origin}${admin ? '/login' : '/dashboard/login'}`);
        await expect(page).toHaveURL(`${origin}${admin ? '/login' : '/dashboard/login'}`);
        if (!admin) await page.getByLabel('Merchant ID', { exact: true }).fill(account.merchantId!);
        await page.getByLabel('Email', { exact: true }).fill(account.email);
        await page.getByLabel('Password', { exact: true }).fill(account.password);
        const loginPath = admin ? '/v1/admin/auth/login' : '/v1/auth/login';
        const response = page.waitForResponse(res => new URL(res.url()).pathname === loginPath && res.request().method() === 'POST');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        if ((await response).status() !== 200) throw new Error(`Password step failed for user ${index + 1}`);
        await expect(page.getByLabel('One-time code', { exact: true })).toBeVisible();
        console.log(`User ${index + 1}/${accounts.length} (${account.plane}): enter the Resend email OTP in the browser and click Verify.`);
        await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible({ timeout: 120_000 });
        const stateFile = `${account.plane}-${index + 1}.json`;
        await context.storageState({ path: join(directory, stateFile) });
        sessions.push({ plane: account.plane, storageState: stateFile });
        console.log(`User ${index + 1}: authenticated session saved.`);
      } finally {
        await context.close();
      }
    }
    const accountFile = join(directory, 'accounts.json');
    await writeFile(accountFile, `${JSON.stringify(sessions, null, 2)}\n`, { mode: 0o600 });
    console.log(`Ready for ${sessions.length} authenticated users. Set E2E_LOAD_ACCOUNTS_FILE to: ${accountFile}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  // Avoid printing Playwright call logs or raw exceptions containing credentials.
  const safeMessage = error instanceof Error && /^(Set E2E_|Private account file|Each private account|Password step failed)/.test(error.message)
    ? error.message : 'Session setup failed. Check the account file, target website and OTP entry; credentials are not printed.';
  console.error(safeMessage);
  process.exitCode = 1;
});
