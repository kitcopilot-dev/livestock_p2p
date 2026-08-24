# Integration surface of the shortlisted banks

Research ticket: "Map the integration surface of the shortlisted banks" (map: Bank-financed checkout). Blocked by the landscape survey; findings capture.

## U.S. Bank Avvance (primary pilot candidate)
- Developer portal launched Oct 21, 2025: API-driven integration, low-code to full headless options, try-before-you-buy (no upfront development investment), dedicated solution engineers, part of the 40+ API U.S. Bank Developer Portal (usbank.com article, Oct 21 2025).
- Loan parameters: $300–$25,000, terms 3–60 months; longer 6–7-year terms added Mar 2026 (ir.usbank.com, Mar 25 2026).
- **"U.S. Bank manages the consumer loan application process"** — the platform embeds the flow; the bank decides (usbank.com, Oct 21 2025).
- Partner/merchant portal: marketing materials, invoicing, pricing management, transaction tracking (same source).
- Distribution: through Elavon (U.S. Bank's acquiring arm) ISV channel; first integrated partner LendPro, a waterfall finance platform (same source; cloud.na.elavon.com/isv-payments-avvance).
- Sandbox/API access: U.S. Bank developer portal offers API exploration and learning ("try-before-you-buy"); whether Avvance-specific sandbox keys are available must be confirmed in the pilot-engagement task (avvance.usbank.com/partnerships).

## Growers Edge
- Platform: digital application, management and payment platform; Partner Portal provides a single place to view, approve, manage and fund crop-input loans (growersedge.com/news/partner-portal…).
- Integrations: AgVend ecosystem for point-of-action financing (agvend.com, Nov 2022); Regrid parcel data (growersedge.com).
- No public developer API documentation found; access is partner-program-gated.

## Farm Credit associations
- No public merchant/consumer API. The only technical path is FPI's AgWorx Lending (loan origination platform for the Farm Credit System) — a bespoke B2B arrangement, not a product you plug into checkout (financialpartners.com/agworx-by-fpi).

## General embedded-lending platforms (Jifiti / Amount)
- Standard model: API/SDK for checkout credit, connecting to a bank partner who originates; surfaces cover application, decision callback, and disbursement. Public docs exist for both; both market "bank partnerships" as their model. These are effectively the multi-bank abstraction itself.

## Feasibility verdict
U.S. Bank Avvance is the only shortlisted candidate with a public, documented, API-driven partnership program today — the pragmatic pilot. Growers Edge is feasible but partner-gated; Farm Credit is bespoke. Design the multi-bank abstraction around the general embedded-lending pattern (one API, many bank partners) with Avvance as the first concrete provider. Open items for the pilot-engagement task: Avvance sandbox keys, fee/rev-share terms, and the $25k loan cap vs. larger lots.
