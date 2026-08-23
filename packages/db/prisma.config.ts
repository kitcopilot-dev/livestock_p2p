import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load .env automatically. Load the repository-root .env
// regardless of the directory the CLI is invoked from.
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadRootEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
