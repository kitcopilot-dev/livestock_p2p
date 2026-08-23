# Payment Rails — Testing Against Real Sandboxes

Both rails are fully implemented (`StripeProvider`, `DwollaProvider` in
`packages/payments/src/`) and webhook routes exist
(`/api/webhooks/stripe`, `/api/webhooks/dwolla`). By default the app runs the
**dry-run simulator** (`PAYMENTS_DRY_RUN=true`), which never touches a real
rail. This guide wires the app up to **Stripe test mode** and **Dwolla
sandbox** so money movement is real (test) money you can inspect in each
provider's dashboard.

## 1. How the rails are selected

| Switch | Effect |
| --- | --- |
| `PAYMENTS_DRY_RUN=true` | All rail calls go to the in-memory `DryRunProvider` (no keys needed). Webhooks are rejected. |
| `PAYMENTS_DRY_RUN=false` + keys | `getProvider()` builds the real `StripeProvider` / `DwollaProvider` from env. |
| `paymentRail` platform setting | Which rail an escrow settles on (`STRIPE` default, `DWOLLA` supported). Every party's wallet must be onboarded on that rail. |

The demo **Fund** button in the UI still calls the ledger-only
`TransactionManager.fund()` — it is a demo affordance. Real funding is
webhook-driven (`charge.succeeded` → `fund`); `chargeAndFundEscrow()` in
`@livestock/payments` performs the real buyer charge and applies funding
synchronously, which is what the smoke test uses.

## 2. Get sandbox keys

### Stripe (test mode)
1. dashboard.stripe.com → **Developers → API keys** → copy the **secret key** (`sk_test_...`).
2. The **platform account** is the account that holds the FBO/escrow balance
   — in a single-account setup that's your own account id (**Developers →
   API keys → Account**), or a separate Connect platform account if you have one.
3. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` to get a
   `whsec_...` webhook secret and forward test webhooks to the local app.

`.env`:
```env
PAYMENTS_DRY_RUN=false
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PLATFORM_ACCOUNT_ID="acct_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
PAYMENT_RAIL_DEFAULT="STRIPE"
```

### Dwolla (sandbox)
1. Sign up at https://accounts-sandbox.dwolla.com/sign-up (any email; the
   sandbox account is separate from production).
2. dashboard-sandbox.dwolla.com → **Applications** → your app's **Key** and
   **Secret**. Dwolla seeds the account with a $5,000 test balance.
3. The **platform funding source** is the master account's funding source
   (Dashboard → Funding Sources — e.g. "Superhero Savings Bank"). Copy its URL
   (it lives under `https://api-sandbox.dwolla.com/funding-sources/...`).
4. Create a webhook subscription **via the API** — the sandbox dashboard UI
   for this is unreliable (if it fails for you, that's known). From repo root:
   ```bash
   set -a && source .env && set +a
   cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/createDwollaWebhook.ts \
     --url https://YOUR-TUNNEL/api/webhooks/dwolla --write-env
   ```
   The `--url` must be **publicly reachable HTTPS** (Dwolla won't deliver to
   `localhost` — use `ngrok http 3000` / cloudflared / a deployed endpoint).
   The script generates the secret, creates the subscription, and appends
   `DWOLLA_WEBHOOK_SECRET` to `.env` (or print it with `--url ...` without
   `--write-env` and paste it yourself). Re-running with the same `--url`
   refuses to duplicate, since Dwolla never returns an existing subscription's
   secret.

`.env`:
```env
PAYMENTS_DRY_RUN=false
DWOLLA_ENV="sandbox"
DWOLLA_KEY="..."
DWOLLA_SECRET="..."
DWOLLA_WEBHOOK_SECRET="..."
DWOLLA_PLATFORM_FUNDING_SOURCE_URL="https://api-sandbox.dwolla.com/funding-sources/..."
PAYMENT_RAIL_DEFAULT="DWOLLA"
```

> The webhook routes are not required for the smoke test (it funds
> synchronously), but they are how production funding/transfer outcomes are
> applied — verify them at least once with `stripe listen` / a Dwolla
> subscription.

## 3. Provision real accounts for the test users

```bash
set -a && source .env && set +a
cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/seedTestUsers.ts
cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/onboardRails.ts --rail STRIPE --set-rail
# or: --rail DWOLLA --set-rail
```

What it does, per rail:
- **Stripe**: creates a `custom` connected account (transfers capability +
  test bank account `tok_ba`) for the buyer/seller/hauler, writes
  `User.stripeConnectedAccountId`, and sets each wallet's
  `externalAccountRef` to the real `acct_...` id.
- **Dwolla**: creates an instantly-verified sandbox customer per user
  (sandbox sentinel `firstName: "verified"`), adds a funding source with the
  test bank (`routing 222222226`), verifies it via micro-deposits (any
  amounts under $0.10 verify immediately in sandbox), and stores the funding
  source URL on the wallet.

`--set-rail` flips the platform `paymentRail` setting so settlements select
the onboarded rail. Idempotent — re-running is a no-op for already-onboarded
wallets. Demo reconciliation (`lib/demoAuth.ts`) never overwrites real refs
with its synthetic `acct_demo_*` refs.

## 4. Run the end-to-end smoke test

```bash
set -a && source .env && set +a
cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/railSmokeTest.ts --rail STRIPE
# or: --rail DWOLLA
```

The script creates a fresh $25,000 escrow, charges the buyer on the real rail
(`chargeAndFundEscrow` — Stripe test card `pm_card_visa`, or the buyer's
Dwolla funding source), delivers, resolves an arbitration, and settles —
printing every `PaymentIntent` (rail refs included) and a ledger zero-sum
check.

Then confirm in the provider dashboard:
- **Stripe**: dashboard → **Developers → Transfers** shows the platform→
  connected-account transfers; **Payments** shows the buyer's captured
  PaymentIntent.
- **Dwolla**: sandbox dashboard → **Transfers**. ACH legs sit in `pending`
  until you click **Process bank transfers** (or POST
  `https://api-sandbox.dwolla.com/sandbox-simulations`); after that the
  `transfer_completed` / `customer_transfer_completed` webhooks fire and the
  local `PaymentIntent`s stay consistent.

## 5. Gotchas

- **Dwolla webhook signature header**: Dwolla signs with
  `X-Request-Signature-SHA-256` (verified against `DWOLLA_WEBHOOK_SECRET`);
  the legacy `dwolla-signature` header is still accepted.
- **Dwolla event topics** are underscore-style (`transfer_completed`,
  `customer_transfer_completed`) — the webhook handler normalizes both
  underscore and dotted variants.
- **Sandbox ACH never clears on its own** — bank-sourced transfers stay
  `pending` until you simulate processing (see above). Balance-sourced
  transfers (platform Dwolla balance) clear instantly.
- **Production funding is webhook-driven.** `charge.succeeded` handles an
  already-funded escrow as a no-op, so a synchronous fund + late webhook
  won't 500.
- **Demo mode stays simulated.** With `PAYMENTS_DRY_RUN=true` the demo Fund
  button and settlement use the in-memory provider; flip the env var and use
  the scripts above for real-rail flows.
