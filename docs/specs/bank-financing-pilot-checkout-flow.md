# Bank-Financed Checkout — Checkout-Flow Section (pilot spec)

**Status:** Draft — checkout-flow section of the Bank-Financed Checkout pilot spec (map: "Map: Bank-financed checkout (replaces Pay later)").
**Source:** resolution of the "Design the buyer checkout flow for bank financing" map ticket (issue comment 5399768246); research branch `research/bank-financing` (commit 9af86dd); related section: `docs/specs/bank-financing-pilot-compliance.md`.

## 1. Scope and posture

The checkout flow lets a buyer choose **Bank financing** at purchase time: the bank owns the credit decision end-to-end, and on approval the bank's disbursement funds the escrow and the buyer repays the bank. The platform's role is facilitation — present the option, create the draft escrow, hand off, resume, and act on the bank's confirmed outcome. Declined buyers pay cash with their connected rail at the same price; the option replaces the current Pay-later toggle.

Surfaces in scope: listing detail → Buy now, accepted offer → Confirm, and the manual `/escrows/new` form. Each already has a cash purchase path; Bank financing is added alongside it as a payment choice.

## 2. Flow overview

| Step | Actor | Action | Result |
|---|---|---|---|
| 1. Choose | Buyer | Selects "Bank financing" on a purchase surface | Financing step opens (attestation) |
| 2. Attest | Buyer | Checks the ag/business-purpose attestation | Eligible to proceed; consumer-purpose purchases have no financing option |
| 3. Draft | Platform | Creates the draft escrow (locks price, holds listing) | Escrow in draft; listing held |
| 4. Handoff | Platform | Redirects to the bank's application with minimal identity context | Buyer in bank flow; escrow shows "Awaiting bank decision" |
| 5. Decide | Bank | Owns the application + credit decision (instant decisioning) | Approved or declined |
| 6. Return | Bank | Redirects buyer to the escrow page with a status token; webhook confirms disbursement | Escrow resumes; status updates |
| 7. Fund | Platform | On verified disbursement: escrow → FUNDED; deal proceeds | Deal proceeds normally |
| 7'. Decline | Platform | Draft survives; buyer offered immediate cash funding at the same price | Buyer completes with connected rail or leaves |
| 7''. Abandon | Platform | No return within the window: draft cancels, listing releases | Listing re-listed |

## 3. Requirements

### F1 — Option on all three purchase surfaces
The "Bank financing" payment choice MUST appear on listing detail → Buy now, accepted offer → Confirm, and the manual `/escrows/new` form, alongside cash, in the same placement the Pay-later toggle occupies today. The manual form MUST offer the same choice (admins/support must not bypass the flow). Cash remains the default selection.

### F2 — Purpose attestation gates the handoff
Selecting Bank financing MUST require the buyer to complete the ag/business-purpose attestation (Compliance R1) before any handoff. Buyers who do not attest MUST NOT reach the bank, and consumer-purpose purchases MUST NOT show the financing option at all.

### F3 — Draft escrow created before handoff
Selecting Bank financing MUST create the draft escrow immediately, before the bank handoff, locking the price and holding the listing. The draft is created through the existing purchase actions (`createEscrowFromListingAction`, `confirmOfferAction`, `createEscrowAction`) with a financing-intent flag; buyer identity is resolved per the app's acting-identity convention (purchase flows act as the demo identity, `getDemoUser()`).

### F4 — Minimal handoff context
The handoff to the bank MUST include only identity context the platform already holds (name, email, entity, KYC status via `packages/compliance`) plus the purchase amount. The platform MUST NOT collect or store credit application data (Compliance R2); the bank's application collects what it needs.

### F5 — Awaiting-bank status
While the buyer is in the bank's flow, the escrow detail page MUST show a live "Awaiting bank decision" status (the exact state is owned by the escrow-states ticket; the user-facing contract is a clear pending state with the deal held).

### F6 — Return and resume
The bank MUST redirect the buyer back to the escrow detail page with a status token; the page MUST resume the flow from the token without the buyer re-entering the listing. A pending handoff MUST be resumable if the buyer closes the tab mid-flow (via the same resume URL).

### F7 — Disbursement webhook
A new `/api/webhooks/bank` route, patterned on the existing stripe/dwolla/partners webhook routes, MUST verify the bank's signature, be idempotent, and be audit-logged. Only a verified disbursement-confirmed event may fund the escrow (Compliance R8).

### F8 — Approval outcome
On verified disbursement, the escrow MUST transition to funded (FUNDED) and the deal proceeds normally: the seller's listing stays sold and the transaction continues through the existing in-transit/inspection flow.

### F9 — Decline outcome
On a bank decline, the draft escrow MUST survive. The buyer MUST be offered immediate cash funding of the same escrow with their connected rail (Stripe/Dwolla) at the same price — no re-entry, no re-negotiation. The bank's decline reason MUST be shown verbatim or not at all (Compliance R2).

### F10 — Abandonment
If the buyer does not return within the handoff window, the draft escrow MUST cancel and the listing MUST be released back to active. The exact timeout and state mechanics are owned by the escrow-states ticket; this section fixes the user-facing contract (the listing never stays held indefinitely).

### F11 — Financing cap
Financed deals MUST be capped at $25,000 (the pilot bank's loan limit). Purchases above the cap MUST show cash only, with copy stating financing is unavailable for that amount. The cap is configurable via platform settings (key owned by the fee-configuration ticket).

### F12 — Bank terms verbatim
Any bank terms (APR, schedule, fees) surfaced on the platform — at checkout or on the escrow — MUST be displayed exactly as returned by the bank, never modified, and never set by the platform (Compliance R3).

## 4. Acceptance checks

- On each of the three surfaces, Bank financing appears alongside cash and defaults to cash (F1).
- A consumer-purpose purchase (no attestation) cannot reach the bank handoff (F2).
- Selecting Bank financing creates the draft escrow and holds the listing before any handoff (F3).
- The handoff payload contains only identity context + amount; the audit log shows no credit data stored (F4, Compliance R2).
- Closing the tab mid-flow and returning via the resume URL resumes the same escrow (F6).
- A tampered or unsigned webhook cannot fund an escrow (F7, Compliance R8).
- An approved + disbursed purchase results in a FUNDED escrow and a sold listing (F8).
- A declined purchase shows the cash-fund-the-same-escrow option at the same price (F9).
- An abandoned handoff releases the listing within the window (F10).
- A $30,000 listing shows no financing option (F11).
- Bank terms render byte-identical to the bank's response (F12, Compliance R3).

## 5. Open items owned by other map tickets

- **Decide the escrow states for bank-funded purchases**: the in-between states (draft → awaiting-bank → funded/cancelled), the abandon-timeout mechanics, and the deadline-sweep interaction.
- **Configure the origination fee and bank-terms display**: the fee amount/type at funding, the financing-cap setting key, and where bank terms render (this section fixes the constraints; that ticket sets the values).
- **Retire the Pay-later machinery**: removal sequencing of the Pay-later toggle and PENDING_PAYMENT once bank financing ships (F1 requires bank financing in the Pay-later slot).
- **Prototype the bank-financed checkout**: mocks exactly this flow.
- **Pilot bank engagement**: confirm the $25k cap and the disclosure/terms payload format with the bank.

## Sources

Resolution of "Design the buyer checkout flow for bank financing" (map ticket, closed); research branch `research/bank-financing` (commit 9af86dd); `docs/specs/bank-financing-pilot-compliance.md` (R1–R3, R8 cross-referenced).
