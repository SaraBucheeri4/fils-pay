/** Destructive fixtures require both an explicitly disposable target and consent. */
export function assertDisposableSeedTarget(databaseUrl: string | undefined, env: NodeJS.ProcessEnv): void {
  if (!databaseUrl) throw new Error("seed: explicit DATABASE_URL is required");
  const target = new URL(databaseUrl);
  const database = decodeURIComponent(target.pathname.slice(1));
  if (env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]", "postgres"].includes(target.hostname)
      || !/(?:^|_)(?:test|disposable|seed)(?:_|$)/.test(database)
      || env.ALLOW_DESTRUCTIVE_SEED !== database) {
    throw new Error("seed: use a local disposable test database and set ALLOW_DESTRUCTIVE_SEED to its exact database name");
  }
}
