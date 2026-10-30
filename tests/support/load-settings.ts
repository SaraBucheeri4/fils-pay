import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export const userCount = integer('E2E_LOAD_USERS', 10, 1, 100);
export const rounds = integer('E2E_LOAD_ROUNDS', 2, 1, 20);
export const rampMs = integer('E2E_LOAD_RAMP_MS', 250, 0, 2000);

export interface LoadAccount {
  plane: 'admin' | 'merchant';
  storageState: string;
}

export function loadAccounts(): LoadAccount[] | null {
  const file = process.env.E2E_LOAD_ACCOUNTS_FILE;
  if (!file) return null;
  const path = resolve(file);
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data) || data.length !== userCount) {
    throw new Error('The load-account file must contain exactly E2E_LOAD_USERS entries');
  }
  const paths = new Set<string>();
  return data.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('plane' in entry) || !('storageState' in entry) ||
      (entry.plane !== 'admin' && entry.plane !== 'merchant') || typeof entry.storageState !== 'string') {
      throw new Error('Every load account requires plane (admin/merchant) and a storageState file');
    }
    const state = resolve(dirname(path), entry.storageState);
    if (!existsSync(state) || paths.has(state.toLowerCase())) {
      throw new Error('Each load user requires a distinct existing storageState file');
    }
    paths.add(state.toLowerCase());
    return { plane: entry.plane, storageState: state };
  });
}
