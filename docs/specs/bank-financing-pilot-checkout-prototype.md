# Bank-Financed Checkout — Checkout-Prototype Section (pilot spec)

Section 6 of the pilot spec, derived from the resolution of **Prototype the bank-financed checkout**.

**Status:** Draft — Prototype Section of the Bank-Financed Checkout pilot spec (map: "Map: Bank-financed checkout (replaces Pay later)").
**Source:** resolution of the "Prototype the bank-financed checkout" map ticket (issue comments 5402498290, 5402518782); the reference artifact `prototypes/bank-checkout-flow.html` (pushed commits 0534173, ff1728b); related sections: `docs/specs/bank-financing-pilot-checkout-flow.md`, `docs/specs/bank-financing-pilot-escrow-states.md`, `docs/specs/bank-financing-pilot-fee-config.md`, `docs/specs/bank-financing-pilot-compliance.md`, `docs/specs/bank-financing-pilot-retire-pay-later.md`.

## 1. Scope and posture

This section records the **interactive prototype** of the bank-financed checkout flow — a self-contained, click-through HTML artifact (`prototypes/bank-checkout-flow.html`, openable directly in a browser, no build step) that visualizes the resolved buyer flow end-to-end: Choose → Attest → Draft → Handoff → Decide → Return → Fund, plus the decline-to-cash and abandon branches.

A prototype ticket raises the fidelity of the discussion so a human can react to *how it looks and behaves* before it becomes implementation work. Its output is therefore the **reference for the build**, not the build itself: the artifact fixes the flow's shape, copy, state labels, and branches. It is deliberately **not** wired to a real bank, does no real disbursement, and stands in for the bank's hosted application with demo Approve / Decline / Abandon controls.

The build is out of this map's scope — the map resolves to a pilot spec, not delivered code. This section fixes the contract that the eventual implementation (Section 2 checkout-flow's requirements, F1–F12) must render as prototype-consistent.

## 2. What the prototype fixes

The prototype encodes each decision from the earlier resolutions as a visible behavior:

| Flow stage | Prototype behavior | Fixed by |
|---|---|---|
| Eligibility wall | Recap header shows the listing price, the $25k financing cap ("Avvance limit"), and a live eligibility tag; an "Above cap" demo toggle switches to "Cash only" and disables financing | Checkout F11, Fee-config F1 |
| Choose | "Pay with my bank rail" (existing escrow flow) vs. "Finance through our bank partner"; financing is the non-default, cash remains default | Checkout F1 |
| Attest | Mandatory ag/business-purpose checkbox; Continue is blocked with an inline error until checked; shows the 1.0% origination fee financed into the loan and "Personalized — shown by the bank" | Checkout F2, Compliance R1 |
| Draft | `DRAFT` state with a reference, sale+fee amount, and "lot held while awaiting decision" | Checkout F3, Escrow-states E1 |
| Handoff | Stand-in for the bank's hosted application, labeled `AWAITING_BANK_DECISION`; demo Approve / Decline / Abandon | Checkout F5 |
| Approve | `FUNDED` outcome: disbursement = sale + origination fee, seller gets full price, platform fee → PLATFORM_REVENUE, buyer owes the bank; no buyer-wallet debit | Fee-config F7, Escrow-states E7 |
| Decline | Draft survives at the same price; "Fund escrow with my rail" or "Abandon draft" | Checkout F9 |
| Abandon | Noted: >60-min absence → reconciliation sweep cancels the draft and releases the lot | Escrow-states E6 |

## 3. Requirements

### P1 — Reference artifact
A runnable prototype of the bank-financed checkout flow MUST exist as `prototypes/bank-checkout-flow.html`, self-contained (single file, no build step, opens in any browser). It MUST render all of: eligibility wall, Choose, Attest, Draft, Handoff, Approve, Decline, and Abandon.

### P2 — Flow fidelity
The prototype MUST walk the exact resolved sequence (Choose → Attest → Draft → Handoff → Decide → Return → Fund) and MUST NOT add, drop, or reorder a step relative to the checkout-flow section (F1–F12).

### P3 — Cap gate visible and functional
The prototype MUST show the financing cap and MUST make a below-cap lot financeable while an above-cap lot shows cash only and disables the financing control — mirroring the acceptance check "a $30,000 listing shows no financing option" (Checkout F11, Fee-config F1).

### P4 — Attestation gate visible and functional
The prototype MUST require the ag/business-purpose attestation (Compliance R1) before the handoff and MUST present the block as an inline error, not a modal or blocking dialog, so the mock stays click-through (Checkout F2).

### P5 — Both decision branches represented
The prototype MUST render both the approval outcome (`FUNDED`: disbursement ledger, seller full price, platform fee → PLATFORM_REVENUE, buyer owes the bank — no buyer-wallet debit) and the decline outcome (draft survives, cash-fund-the-same-escrow or abandon) (Checkout F8/F9, Fee-config F7, Escrow-states E7).

### P6 — State labels match the state machine
All status labels the prototype displays (`DRAFT`, `AWAITING_BANK_DECISION`, `FUNDED`, `DECLINED`) MUST match the `EscrowStatus` values from the escrow-states section (Escrow-states E1–E4), so the mock and the machine use one vocabulary.

### P7 — Dead-end-free interaction
Every interactive path in the prototype MUST terminate in a state (Approve → FUNDED, Decline → cash-fund or abandon, Abandon → released note, cash → existing flow), so a reviewer cannot get stuck. This qualifies the prototype's own completeness.

### P8 — Not wired to real rails
The prototype MUST NOT initiate a real bank application, call the bank's API, or perform a real disbursement. The bank's application and the disbursement webhook (`/api/webhooks/bank`) are represented and described, never executed (Checkout F7).

## 4. Acceptance checks

- Opening `prototypes/bank-checkout-flow.html` in a browser renders the flow and all seven rail steps without a build step (P1).
- Clicking Finance → Attest → (Continue without checking) shows an inline error and stays on the Attest step; checking and continuing reaches the handoff (P4).
- With "Above cap" toggled on, the financing control is disabled and labeled cash-only (P3).
- Approving the bank step lands on `FUNDED` with ledger math sale+fee, seller full price, fee → PLATFORM_REVENUE, and no buyer account debit shown (P5).
- Declining lands on `DECLINED` with cash-fund-the-same-escrow and abandon options (P5).
- Every label shown (`DRAFT`, `AWAITING_BANK_DECISION`, `FUNDED`, `DECLINED`) equals the corresponding `EscrowStatus` enum value (P6).
- No path dead-ends; each terminates in a valid state (P7).
- No browser network call goes outside the local file — no real bank API is touched (P8).

## 5. Open items

- **Prototype reaction:** the artifact is produced for the pilot spec's reader to react to. Until it is signed off, the section records the proposed behavior; sign-off freezes P1–P8 as the build reference.
- **Implementation handoff:** the prototype's fidelity becomes the acceptance criteria for the eventual build of the checkout-flow section (F1–F12). It is out of this map's scope; it is handed off when the map's destination (the pilot spec) is complete.
- **Pilot bank engagement:** the mock's "personalized terms from the bank" stand-in and the `$25,000` Avvance cap must be confirmed against the real bank's payload format and underwriting limit before build.

## Sources

Resolution of "Prototype the bank-financed checkout" (map ticket, issue comments 5402498290, 5402518782); reference artifact `prototypes/bank-checkout-flow.html` (commits 0534173, ff1728b); cross-referenced sections: `checkout-flow.md` (F1–F12), `escrow-states.md` (E1–E7), `fee-config.md` (F1–F9), `compliance.md` (R1–R8), `retire-pay-later.md`.
