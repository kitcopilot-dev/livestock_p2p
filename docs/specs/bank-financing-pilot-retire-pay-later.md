# Bank-Financed Checkout — Pay-Later Retirement Section (pilot spec)

Section 5 of the pilot spec, derived from the resolution of **Retire the Pay-later machinery**.

## 1. Scope and posture

This section sequences the retirement of the platform-financed "Pay later" product as bank financing replaces it (the map's standing decision). The goal: **no orphaned escrows and no dead settings** — every in-flight deal resolves on its original terms, and no Pay-later machinery survives once the tail is empty. It assumes the checkout-flow (F-requirements), escrow-states (E-requirements), and fee-config (F-requirements) sections.

## 2. Retirement sequence

Two deploys:

**Deploy A — pilot go-live (surface cutover).** All three purchase surfaces (listing buy-now, offer confirm, `/escrows/new`) swap the Pay-later toggle for the bank-financing option in the same deploy. Declined buyers pay cash at the same price — no financing fallback (checkout-flow). No new `PENDING_PAYMENT` escrows are created after this deploy. The Pay-later backend (job, sweep backstop, keys, settings page, dashboard section) **stays live** to serve the in-flight tail.

**Deploy B — backend retire (after the tail is empty).** Trigger: the reconciliation sweep reports zero `PENDING_PAYMENT` rows and the `financingDeadline` queue is drained. One deploy removes: the `financingDeadline` worker, the sweep backstop branch, the six `financing*` settings keys, the `/settings/financing` page and its summary card, the dashboard **Financing due** section + `PayNowShortcut`, and the lapse guard. The `/settings` financing card is replaced by a one-line archival note ("Pay-later financing retired <date>").

## 3. Requirements

### R1 — No forced cancellation
In-flight `PENDING_PAYMENT` escrows at cutover MUST resolve on their original terms — funded by the buyer or auto-cancelled at their stamped deadline (via the retained `financingDeadline` job). No bulk cancellation, no conversion to bank financing.

### R2 — Status and entry values kept, never created anew
The `PENDING_PAYMENT` status and `FINANCING_FEE` ledger-entry enum values MUST remain (historical rows reference them) but MUST NOT be created for any new escrow after go-live. No enum-dropping migration.

### R3 — Tail surfaces stay live
Through the tail, the escrow-page payment banner/countdown, the dashboard **Financing due** section, and `PayNowShortcut` MUST keep serving in-flight escrows. Buyers must be able to fund or see their deadline.

### R4 — Lapse guard removed
The `financingMaxLapses` key and guard logic MUST be removed with the backend retire. No buyer is "financing-disabled" once the product is gone; the bank owns the credit decision (no platform credit judgment).

### R5 — Settings removed, audit preserved
The six `financing*` keys and `/settings/financing` page MUST be removed in Deploy B. The append-only audit log MUST retain every historical `PLATFORM_SETTING_UPDATED` row for those keys; `/settings` shows the archival note.

### R6 — No cross-contamination with the bank path
No Pay-later data (deadlines, fees, lapse counts, `FINANCING_FEE` entries) MAY flow into bank-financed escrows or the bank path (compliance R2 — nothing is carried over). Bank escrows use `AWAITING_BANK_DECISION` and `bankFinancing*` keys exclusively.

### R7 — Hard removal
The Pay-later machinery MUST be deleted outright in Deploy B — no dormant feature flag. Git history is the rollback path.

## 4. Acceptance checks

- After Deploy A, a marketplace purchase offers only Cash and Bank financing; no "Pay later" text appears on any purchase surface. (cutover)
- A pre-cutover `PENDING_PAYMENT` escrow still auto-cancels at its stamped deadline with the job retained. (R1)
- Post-cutover, no new escrow row has status `PENDING_PAYMENT` or an entry of type `FINANCING_FEE`. (R2)
- During the tail, the dashboard shows an in-flight financed escrow with its countdown and a working Pay now button. (R3)
- After Deploy B, `financingMaxLapses` is absent from settings; no `financing*` key appears in `getPlatformSettings`. (R4, R5)
- The audit log still shows historical `financingWindowDays`/`financingFeeBps` change rows after Deploy B. (R5)
- A bank-financed escrow's entries contain only `BANK_DISBURSEMENT` + `ORIGINATION_FEE`, no `FINANCING_FEE`. (R6)
- Grep finds no "Pay later" string in any purchase surface component after Deploy B. (R7)

## 5. Open items

- **Prototype the bank-financed checkout** mocks the Deploy-A surface swap (the toggle slot becoming the bank option with the fee line).
- **Compliance sign-off** confirms nothing from Pay later carries into the bank path (R2 conformance).
- **Pilot bank engagement** sets the go-live date that triggers Deploy A.
