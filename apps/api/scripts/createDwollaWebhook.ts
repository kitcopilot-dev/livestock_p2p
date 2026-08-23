/**
 * Create a Dwolla webhook subscription via the API.
 *
 * The sandbox dashboard's webhook UI is unreliable, but the API is a single
 * POST: https://developers.dwolla.com/docs/api-reference/webhook-subscriptions/create-a-webhook-subscription
 *
 * Requires DWOLLA_KEY / DWOLLA_SECRET in `.env` (DWOLLA_ENV defaults to
 * sandbox). The subscription URL must be publicly reachable over HTTPS —
 * Dwolla cannot deliver to `localhost`; use a tunnel (ngrok / cloudflared) or
 * a deployed endpoint.
 *
 * Run from repo root with env loaded:
 *   set -a && source .env && set +a
 *   cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/createDwollaWebhook.ts \
 *     --url https://YOUR-TUNNEL/api/webhooks/dwolla [--secret mys3cret] [--write-env]
 *
 * The `--secret` you pass (or that is generated) is exactly what goes into
 * `.env` as DWOLLA_WEBHOOK_SECRET — Dwolla signs every webhook payload with
 * it (X-Request-Signature-SHA-256) and the app verifies against it.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DwollaProvider } from "@livestock/payments";

function arg(name: string): string | undefined {
  const eqHit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eqHit) return eqHit.split("=").slice(1).join("=");
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const url = arg("url");
const secret = arg("secret") ?? randomBytes(24).toString("hex");
const writeEnv = hasFlag("write-env");

if (!url) {
  console.error("Usage: tsx createDwollaWebhook.ts --url https://YOUR-PUBLIC-URL/api/webhooks/dwolla [--secret s] [--write-env]");
  console.error("  --url       publicly reachable HTTPS URL (tunnel or deployed endpoint)");
  console.error("  --secret    optional; generated if omitted (default)");
  console.error("  --write-env append DWOLLA_WEBHOOK_SECRET to the repo-root .env if absent");
  process.exit(2);
}
if (!/^https:\/\//i.test(url)) {
  console.error(`Refusing to create a subscription for a non-HTTPS URL: ${url}`);
  console.error("Dwolla requires a publicly reachable HTTPS endpoint; use ngrok/cloudflared or a deployed URL.");
  process.exit(2);
}
if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url)) {
  console.error(`Refusing to create a subscription for a local URL: ${url}`);
  console.error("Dwolla cannot deliver to localhost — use a tunnel, e.g. `ngrok http 3000`.");
  process.exit(2);
}

// Can't use DwollaProvider.fromEnv() here — it throws without
// DWOLLA_WEBHOOK_SECRET, which is exactly what we're creating. Build the
// provider directly; the client is a dwolla-v2 app token client.
const key = process.env.DWOLLA_KEY;
const dwSecret = process.env.DWOLLA_SECRET;
if (!key || !dwSecret) {
  console.error("Missing DWOLLA_KEY / DWOLLA_SECRET in .env (see PAYMENTS_TESTING.md).");
  process.exit(2);
}
const environment = process.env.DWOLLA_ENV === "production" ? "production" : "sandbox";
const client = new DwollaProvider({
  key,
  secret: dwSecret,
  environment,
  platformFundingSourceUrl: process.env.DWOLLA_PLATFORM_FUNDING_SOURCE_URL ?? "",
  webhookSecret: "", // unused for this request
}).client;

async function main(): Promise<void> {
  // Idempotency guard: if a subscription for this exact URL already exists,
  // the secret is unrecoverable (Dwolla never returns it), so tell the user
  // to reuse their recorded secret or delete + recreate.
  const listRes = await client.get("webhook-subscriptions");
  const subs = listRes.body as {
    _embedded?: { "webhook-subscriptions"?: Array<{ id: string; url?: string }> };
  };
  const existing = subs._embedded?.["webhook-subscriptions"]?.find((s) => s.url === url);
  if (existing) {
    console.error(`A webhook subscription for ${url} already exists (id ${existing.id}).`);
    console.error("Dwolla does not return the secret for existing subscriptions.");
    console.error("If you lost the secret: delete it (sandbox dashboard or `client.delete`) and re-run.");
    process.exit(1);
  }

  const res = await client.post("webhook-subscriptions", { url, secret });
  const location = res.headers.get("location");
  if (!location) throw new Error("Dwolla did not return a location header for the new webhook subscription");
  const id = location.split("/").pop();

  console.log(`✔ Webhook subscription created:`);
  console.log(`    url      ${url}`);
  console.log(`    location ${location}`);
  console.log(`    id       ${id}`);

  const line = `DWOLLA_WEBHOOK_SECRET="${secret}"`;
  if (writeEnv) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const envPath = path.join(repoRoot, ".env");
    const hasSecret = existsSync(envPath) && /^DWOLLA_WEBHOOK_SECRET=/m.test(readFileSync(envPath, "utf8"));
    if (hasSecret) {
      console.error("DWOLLA_WEBHOOK_SECRET already present in .env — not overwriting. Add/update it manually:");
    } else {
      appendFileSync(envPath, `\n${line}\n`);
      console.log(`✔ Appended to ${envPath}`);
    }
  } else {
    console.log(`\nPaste into .env (it is the webhook signing secret):`);
    console.log(`  ${line}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
