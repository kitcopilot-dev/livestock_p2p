import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Load the repository-root .env so DATABASE_URL / REDIS_URL / rail secrets are
// visible to the API process regardless of the launch directory.
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

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: "standalone",
  // The Freebuff preview iframe reaches the dev server via 127.0.0.1, which
  // Next 16 treats as a cross-origin dev request unless explicitly allowed.
  allowedDevOrigins: ["127.0.0.1", "localhost", "livestockp2p.exe.xyz"],
  // Workspace packages ship TypeScript sources; Next transpiles them.
  transpilePackages: [
    "@livestock/shared",
    "@livestock/db",
    "@livestock/domain",
    "@livestock/compliance",
    "@livestock/payments",
    "@livestock/jobs",
  ],
};

export default nextConfig;
