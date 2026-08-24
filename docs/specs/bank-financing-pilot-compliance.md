# Bank-Financed Checkout — Compliance Section (pilot spec)

**Status:** Draft — compliance section of the Bank-Financed Checkout pilot spec (map: "Map: Bank-financed checkout (replaces Pay later)").
**Source:** research findings `docs/research/bank-financing/03-lending-compliance.md` (branch `research/bank-financing`, commit 9af86dd).
**Caveat:** not legal advice. This section is the engineering specification; counsel sign-off is owned by the "Compliance sign-off for facilitated bank credit" map ticket, and bank-specific confirmations by the "Pilot bank engagement" ticket.

## 1. Scope and posture

The pilot offers **bank-originated credit at checkout**: a buyer chooses "Bank financing" on a purchase, the bank owns the credit decision end-to-end, and on approval the bank funds the escrow and the buyer repays the bank. The platform facilitates the handoff; it does not lend, does not decide credit, and does not hold the loan.

Compliance posture rests on three pillars:

1. **The credit is agricultural/business-purpose credit**, which is exempt from Regulation Z (TILA) — see §2.
2. **The bank is the true lender** — it originates and funds every loan; the platform's role is facilitation — see §3.
3. **The platform's compensation is service/origination fees**, not loan participation — see R4.

## 2. Credit product boundary (Reg Z exemption)

- 12 CFR §1026.3(a)(1) exempts from Regulation Z an extension of credit primarily for a **business, commercial, or agricultural purpose**; §1026.3(a)(2) exempts credit to non-natural persons. Ranchers buying livestock for their operation are agricultural-purpose borrowers.
- The exemption turns on the loan's **primary purpose**. The pilot therefore excludes consumer-purpose purchases (personal, family, or household use) and must capture purpose at checkout.

## 3. True-lender posture

The bank is the true lender: it originates and funds all loans through the partnership, which is the structure that keeps the platform out of lender status. The platform must maintain this boundary:

- **No credit decision**: the platform does not approve, decline, score, or pre-screen. Passing KYC identity context (name, email, entity, KYC status) to the bank is identity verification, not underwriting.
- **No loan economics**: the platform does not set rates, terms, or repayment schedules; it displays the bank's terms verbatim.
- **No risk assumption**: no indemnity for bank losses, no recourse/buyback, no predominant economic interest in the loans (the standing decisions — non-recourse, origination fee + rev share — are compatible only when compensation is service fees, see R4).

## 4. Requirements

### R1 — Purpose attestation at checkout
The financing step MUST require the buyer to attest that the purchase is for an agricultural or business purpose before the bank handoff, and MUST block consumer-purpose purchases from the pilot (no attestation, no financing option). The attestation MUST be captured in the escrow record and appear in the audit log.

### R2 — Bank owns the credit decision
The platform MUST NOT make, influence, or record a credit decision. The bank's application collects the data it needs; the platform passes only identity context it already holds from KYC and MUST NOT store credit application data, credit scores, or decline reasons (decline status may be stored; the bank's reason is displayed verbatim or not at all).

### R3 — Bank-verbatim disclosures
The platform MUST display the bank's terms (APR, schedule, fees) exactly as provided by the bank, MUST NOT modify or editorialize them, and MUST NOT set rates itself. Any rate or term surfaced on the platform comes from the bank's response data.

### R4 — Compensation as service fees
The platform's origination fee and any bank revenue share MUST be structured and documented as service/origination fees for facilitation, NOT as loan participation, assignment, or a share of loan revenue that could constitute a "material economic interest" (Nev. Rev. Stat. §675.035(3)(c)). The fee amount/configuration is owned by the "Configure the origination fee and bank-terms display" ticket; this requirement constrains its structure.

### R5 — Data-sharing consent and privacy
Before the handoff, the buyer MUST consent to their identity and purchase data being shared with the bank for credit evaluation. The consent MUST be recorded (audit log), and the platform's privacy handling MUST cover: no retention of bank-returned credit data beyond what the transaction requires, secure transmission (TLS; webhook signatures per the existing `packages/compliance` webhook-signature pattern), and a documented retention/deletion policy for any bank webhook payloads.

### R6 — Marketing and representation rules
The platform MUST NOT make rate, fee, or approval claims (e.g., "0%", "instant approval", "no credit check") that the bank has not authorized. Copy at checkout is limited to describing the option and pointing to the bank's terms.

### R7 — State licensing matrix
The platform MUST maintain a state-by-state matrix covering: (a) whether "arranging" or "soliciting" credit for a bank requires a license in each state where buyers or sellers operate (examples with triggers: NV soliciting/material economic interest, TN endorsement company, HI installment-loan arranging, ME/IL totality-of-circumstances), and (b) servicing/debt-collection licenses if the platform ever services payments (TX, NE, GA examples). The matrix MUST be built with counsel (owned by the "Compliance sign-off" ticket) and MUST gate the pilot's go-live states: the pilot starts only in states where the matrix shows the platform needs no license or has obtained one.

### R8 — Webhook security and integrity
The bank disbursement webhook MUST verify authenticity (signature/secret, per the existing webhook-signature pattern in `packages/compliance`), MUST be idempotent, and MUST be audit-logged. Only a verified disbursement-confirmed event may fund an escrow.

### R9 — Records and audit
The pilot MUST keep an immutable audit record (reusing the existing audit log) of: purpose attestations, data-sharing consents, bank handoff requests, webhook events, and fee postings — sufficient to demonstrate the R1–R8 boundaries if examined.

## 5. Licensing matrix skeleton (to be completed with counsel)

| State | Arranging/soliciting license needed? | Servicing license needed? | Notes / statute | Status |
|---|---|---|---|---|
| (fill from buyer/seller concentration) | | | | |

Known starting points from research: NV (Nev. Rev. Stat. §675.020/.035), TN (Tenn. Code Ann. §45-5-102/103), HI (Haw. Rev. Stat. §480J), ME (Me. Rev. Stat. tit. 9-A §2-702), IL (815 ILCS 123/15-5-15), TX (Tex. Fin. Code §342.051), NE (Neb. Rev. Stat. §45-1005), GA (Ga. Code Ann. §7-3-4). FL does not require a broker license to arrange consumer loans.

## 6. Acceptance checks for the pilot

- A consumer-purpose purchase cannot reach the bank handoff (R1).
- No platform code path makes or records a credit decision; the audit log shows no such events (R2).
- Every bank term shown at checkout is byte-identical to the bank's response (R3).
- Fee ledger entries are typed as origination/service fees, not loan participation (R4).
- Consent + attestation rows exist in the audit log for every financed escrow (R5, R9).
- An unauthenticated or tampered webhook cannot fund an escrow (R8).
- The go-live state set ⊆ states cleared in the licensing matrix (R7).

## 7. Open items owned by other map tickets

- **Pilot bank engagement** (task): confirm with the bank that §1071 (ECOA small-business data collection) reporting sits with the bank as originator, and obtain the bank's approved disclosure/terms payload format.
- **Compliance sign-off** (task): counsel review of this section, the licensing matrix, the consent/attestation language, and the fee structure.

## Sources

12 CFR §1026.3 (eCFR; CFPB §1026.3 interp); Chapman and Cutler, "US Regulatory Landscape: Fintech Product Overview" (Apr 2024); Fintech Council, FAQs on Bank-Fintech Partnerships (2021); state statutes cited in §5; full citations in `docs/research/bank-financing/03-lending-compliance.md`.
