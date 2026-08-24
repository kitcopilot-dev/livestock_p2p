# Bank-Financed Checkout — Escrow-States Section (pilot spec)

**Status:** Draft — escrow-states section of the Bank-Financed Checkout pilot spec (map: "Map: Bank-financed checkout (replaces Pay later)").
**Source:** resolution of the "Decide the escrow states for bank-funded purchases" map ticket (issue comment 5401190181); related sections: `docs/specs/bank-financing-pilot-checkout-flow.md` and `docs/specs/bank-financing-pilot-compliance.md`.

## 1. Scope and posture

The escrow state machine gains a bank-funding path. When a buyer selects **Bank financing**, the bank owns the credit decision and — on approval — its disbursement funds the escrow directly; the buyer owes the bank, not the platform. The platform's facilitation role therefore adds exactly one new surface to the machine: the states between "draft created" and "funded". Everything downstream of FUNDED (in-transit, inspection, dispute, arbitration, settlement, refund) is unchanged.

The buyer's money never moves until the bank's disbursement lands. The escrow must therefore be able to hold the deal while the bank decides, must react to all three outcomes (approved, declined, abandoned), and must never be fundable by a path other than a verified bank disbursement.

## 2. State model

New status `AWAITING_BANK_DECISION` (the state ends on a *decision* — approved or declined):

```
DRAFT -> AWAITING_BANK_DECISION -> FUNDED   (bank approved + disbursed)
   |            |-> DRAFT     (bank declined; draft survives for cash funding)
   |            |-> CANCELLED (buyer abandon or decision deadline; listing releases)
```

| From | To | Actors | When |
|---|---|---|---|
| DRAFT | AWAITING_BANK_DECISION | BUYER, PLATFORM | Buyer selects Bank financing and the purpose attestation is recorded; stamps `bankDecisionDeadlineAt` |
| AWAITING_BANK_DECISION | FUNDED | PLATFORM | Verified `/api/webhooks/bank` disbursement event |
| AWAITING_BANK_DECISION | DRAFT | PLATFORM | Bank decline; draft survives with its price lock for cash funding |
| AWAITING_BANK_DECISION | CANCELLED | BUYER, PLATFORM, SYSTEM_TIMER | Buyer abandons, admin cancels, or the decision deadline passes |

## 3. Requirements

### E1 — Distinct awaiting-bank state
A bank-financed purchase MUST move the escrow to a real `AWAITING_BANK_DECISION` state (an `EscrowStatus` value, not a flag on DRAFT) when the handoff begins. The state MUST appear in the state machine's transition table with guards, and the escrow detail page MUST derive its "Awaiting bank decision" status from the state (Checkout F5).

### E2 — Attestation gates the handoff transition
The `DRAFT -> AWAITING_BANK_DECISION` transition MUST only be legal once the buyer's ag/business-purpose attestation (Compliance R1) is recorded on the escrow. A buyer who has not attested MUST NOT be able to move the escrow into the awaiting-bank state.

### E3 — Funding only on verified disbursement
The `AWAITING_BANK_DECISION -> FUNDED` transition MUST be legal only for the PLATFORM actor, driven by a signature-verified, idempotent disbursement event (Checkout F7) or by an audit-logged admin "mark funded" fallback for sandbox/test gaps. There MUST be NO buyer-triggered funding path on the bank route: the buyer's rail cannot fund an awaiting-bank escrow.

### E4 — Decline returns the draft
On a bank decline, the escrow MUST transition `AWAITING_BANK_DECISION -> DRAFT` (PLATFORM) — the draft survives with its price lock, and the buyer is offered immediate cash funding of the same escrow at the same price (Checkout F9). The bank's decline reason MUST be stored as status only and displayed verbatim or not at all (Compliance R2).

### E5 — Abandonment and timeout cancel and release
A buyer who abandons mid-application (cancels from the awaiting-bank state, or never returns) MUST cancel the escrow `AWAITING_BANK_DECISION -> CANCELLED`, and the seller's listing MUST be released back to active. The listing MUST NOT remain held indefinitely.

### E6 — Decision deadline and sweep ownership
The handoff MUST stamp `bankDecisionDeadlineAt` (default 60 minutes from handoff; the bank's instant decisioning should not hold a listing longer). The reconciliation sweep MUST cancel `AWAITING_BANK_DECISION` escrows past the deadline. The Pay-later financing-deadline sweep MUST NOT apply to bank escrows: it matches only `PENDING_PAYMENT`, and bank escrows never enter it. Bank-funded escrows MUST NOT carry a financing fee, a payment deadline, or lapse accounting — that machinery is retired with Pay later.

### E7 — Bank-disbursement ledger entry
Funding a bank escrow MUST post a `BANK_DISBURSEMENT` ledger entry crediting `PLATFORM_ESCROW` from a `BANK_FUNDING_SOURCE` account, with the bank's transaction reference in the entry. It MUST NOT debit the buyer's wallet (the buyer owes the bank, not the platform). No `FINANCING_FEE` entry is posted on the bank path.

### E8 — Milestones and audit for every bank transition
Each of the four bank transitions MUST write a milestone and an audit row: `BANK_APPLICATION_STARTED` (handoff), `BANK_APPROVED` + `BANK_DISBURSED` (fund), `BANK_DECLINED` (decline), `BANK_DECISION_MISSED` (timeout), `CANCELLED` (abandon).

### E9 — Idempotent disbursement
The `AWAITING_BANK_DECISION -> FUNDED` transition MUST be idempotent on the bank's transaction reference: a replayed or duplicated webhook MUST NOT double-post ledger entries or create duplicate milestones.

### E10 — Decline-to-cash reuses the existing fund path
After a decline the escrow is a normal DRAFT: the existing `DRAFT -> FUNDED` transition (BUYER, PLATFORM) and the existing `fund()` ledger path apply unchanged, with no schema or guard changes.

## 4. Acceptance checks

- A bank-financed purchase creates `AWAITING_BANK_DECISION` with `bankDecisionDeadlineAt` = handoff + 60 min and a `BANK_APPLICATION_STARTED` milestone (E1, E6, E8).
- Attempting `DRAFT -> AWAITING_BANK_DECISION` without a recorded attestation fails the transition guard (E2).
- A buyer-facing "fund this escrow" action on an awaiting-bank escrow returns an illegal-transition error; the webhook path and an admin fallback both succeed and both are audit-logged (E3).
- A simulated bank decline moves the escrow back to DRAFT with a `BANK_DECLINED` milestone; the buyer can then fund it via the existing rail at the same price (E4, E10).
- An awaiting-bank escrow past its deadline is cancelled by the sweep with a `BANK_DECISION_MISSED` milestone and the listing returns to ACTIVE (E5, E6).
- A duplicated disbursement webhook for the same `bankTransactionRef` posts exactly one `BANK_DISBURSEMENT` entry and one `BANK_DISBURSED` milestone (E7, E9).
- Bank escrows never show a financing fee, payment deadline, or lapse accounting; the financing-deadline sweep never matches them (E6).

## 5. Open items

- The 60-minute default and whether it is admin-configurable (settings key) → **Configure the origination fee and bank-terms display**.
- Who may act as PLATFORM on the manual "mark funded" fallback → **Compliance sign-off for facilitated bank credit**.
- The bank's actual event contract (webhook payload, status token) → **Pilot bank engagement**.
- The escrow `EscrowStatus`/`MilestoneKind`/`LedgerEntryType` enum additions and `packages/domain` methods (`markAwaitingBankDecision`, `markBankDeclined`, `fundByBank`, `expireBankDecision`) are specified above but unbuilt — the build belongs to the implementation that follows the pilot spec.
