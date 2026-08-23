import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Loads the nearest `.env` walking up from the current working directory
 * (typically the monorepo root). Each entrypoint (Next.js config, worker
 * processes, prisma.config.ts) calls this so one root `.env` serves the whole
 * workspace.
 *
 * Returns the path of the loaded file, or undefined if none was found.
 */
export function loadRootEnv(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
