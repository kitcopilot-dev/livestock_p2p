/**
 * Environment accessors. At runtime the process is expected to have the
 * repository-root `.env` loaded (Next.js config, worker entrypoints, or the
 * deployment platform inject real secrets).
 */

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}
