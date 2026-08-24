# Bank-Financed Checkout — Fee-Configuration Section (pilot spec)

Section 4 of the pilot spec, derived from the resolution of **Configure the origination fee and bank-terms display**.

## 1. Scope and posture

This section defines how the platform is compensated on bank-financed deals and how bank-owned terms are displayed. Standing decisions it implements: the platform earns an **origination fee** plus a **bank revenue share**; the bank owns all loan terms (APR, schedule); compensation is structured as **service fees**, never loan participation (compliance R4); bank terms render **byte-identical** to the bank's response (compliance R3) and are **never persisted** (compliance R2).

The existing Pay-later fee machinery (`financingFeeBps`, `FINANCING_FEE`) is out of scope here — it is retired by the Retire the Pay-later machinery ticket. This section defines its bank-path replacement.

## 2. Fee model

- **Origination fee — financed into the loan.** The bank's disbursement covers the sale amount **plus** the platform's origination fee. At funding the platform splits its fee to `PLATFORM_REVENUE`; the remainder credits escrow. The buyer repays the bank the full loan; the seller receives the full sale price. **No buyer-wallet debit** on the bank path.
- **Recognition.** The `ORIGINATION_FEE` entry posts **at funding**, atomically with `BANK_DISBURSEMENT` in `fundByBank`.
- **Bank revenue share.** Recognized **when received** — the bank pays its share periodically (e.g., monthly); each payment posts a `BANK_REV_SHARE` entry. The negotiated rate is stored in settings for display/reference only; no accrual.

## 3. Requirements

### F1 — Loan-total cap
The financed cap (`bankFinancingMaxCents`, default **$25,000**) applies to the **loan total**: a deal is bank-financeable only when sale + origination fee ≤ cap. The cap check runs in the same purchase action that creates the draft.

### F2 — Origination fee configurable by admins
A `bankFinancingOriginationFeeBps` setting (default **100** = 1.0%, validated 0–1,000) is editable by platform admins on an admin settings section patterned on `/settings/financing`. Changes are audit-logged (`PLATFORM_SETTING_UPDATED`).

### F3 — Fee shown at checkout
Every surface offering bank financing MUST display the platform's origination fee (as bps or dollars of the sale) at the point of choice, alongside the statement that personalized terms come from the bank.

### F4 — Bank terms read from the bank
Personalized terms (APR, schedule) MUST come from the bank's response to the buyer's application and MUST render byte-identical to that response (compliance R3). The platform never constructs, edits, or ratesets terms.

### F5 — Terms never persisted
The bank's term quote MUST NOT be written to the database (compliance R2). The escrow stores only the bank's decision status and transaction reference; the terms exist transiently in the application session.

### F6 — Decision window configurable
A `bankFinancingDecisionWindowMinutes` setting (default **60**) governs the bank-decision deadline swept by the reconciliation sweep (escrow-states E6). Admin-editable and audit-logged.

### F7 — ORIGINATION_FEE ledger entry
Funding posts an `ORIGINATION_FEE` entry: debit source `BANK_FUNDING_SOURCE` (the disbursement), credit `PLATFORM_REVENUE`, amount = round-half-up(sale × bps / 10,000), with the bank's transaction reference. Atomic with `BANK_DISBURSEMENT` (escrow-states E7).

### F8 — BANK_REV_SHARE ledger entry
Each bank revenue-share payment received posts a `BANK_REV_SHARE` entry crediting `PLATFORM_REVENUE`, referencing the bank's remittance. A `bankFinancingRevShareBps` setting stores the negotiated rate for display/reference only and is never used to compute entries.

### F9 — Retire FINANCING_FEE on the bank path
Bank-funded escrows MUST NOT post `FINANCING_FEE` entries (escrow-states: no `FINANCING_FEE` on the bank path). The entry type and `financing*` keys retire with the Pay-later machinery.

## 4. Acceptance checks

- A $30,000 sale shows **no** bank-financing option when `bankFinancingOriginationFeeBps` = 100 (loan total $30,300 > $25,000 cap). (F1)
- Editing `bankFinancingOriginationFeeBps` on the admin section persists, validates range, and creates an audit row. (F2)
- The checkout choice surface shows the origination fee and the "personalized terms from the bank" notice. (F3)
- A captured bank response's terms string renders in the UI unchanged — byte-for-byte equal to the API payload. (F4)
- No row in the database contains the bank's term quote (grep the schema for any bank-terms column; none exists). (F5)
- Setting `bankFinancingDecisionWindowMinutes` to 5 causes an awaiting-bank escrow to cancel within ~5 minutes via the sweep. (F6)
- Funding a bank escrow posts exactly `BANK_DISBURSEMENT` (escrow credit) + `ORIGINATION_FEE` (revenue credit); the buyer's wallet ledger shows no movement. (F7)
- Posting a received bank rev-share payment creates one `BANK_REV_SHARE` entry crediting `PLATFORM_REVENUE`. (F8)
- A funded bank escrow's entries contain no `FINANCING_FEE`. (F9)

## 5. Open items

- **Compliance sign-off** verifies the fee display and ledger types conform to R3/R4 (and that `BANK_REV_SHARE` carries no loan-participation implication).
- **Pilot bank engagement** confirms Avvance accepts fee-financed loans (disbursement = loan including the fee) and how the periodic rev-share remittance is delivered/identified.
- **Prototype the bank-financed checkout** mocks the fee display at the choice point and the byte-identical terms render.
- **Retire the Pay-later machinery** sequences removal of `financingFeeBps`/`FINANCING_FEE` and hands the `financing*` settings keys to this section's `bankFinancing*` replacement.
