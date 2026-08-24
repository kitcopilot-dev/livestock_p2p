# Bank-financing landscape for agricultural buyers (US)

Research ticket: "Survey US bank-financing options for agricultural buyers" (map: Bank-financed checkout). Findings capture; primary sources cited per claim.

## The landscape in three buckets

### 1. Farm Credit System (FCS) — the dominant ag lender
- 4 banks + 55 associations, cooperatives; supports 615k+ farmers/ranchers and >40% of US farm business debt (Farm Credit Funding Corp, farmcreditfunding.com; FCA oversight, fca.gov).
- Associations (FCSAmerica, Farm Credit Mid-America, Compeer, AgTrust, Capital Farm Credit) offer livestock/operating loans (fcsamerica.com/financing; fcma.com/loans/livestock).
- No public embedded-checkout API. FPI (Farm Credit Financial Partners) provides the system's tech — AgWorx Lending (loan origination software, financialpartners.com) — a possible technical entry point, but a partnership would be bespoke/branch-level, not self-serve API.

### 2. Ag-focused fintech / embedded lending
- **Growers Edge**: embedded financing for ag retailers; digital application/management/payment platform; Partner Portal to view/approve/manage/fund crop-input loans; funds restricted to the retail location ("Lock the spend in"); integrates with AgVend; $15M investment + leadership transition Feb 2023 (growersedge.com). Focus is input financing at ag retail, not marketplace checkout.
- **ProducePay**: marketplace + financing for fresh produce; financing for growers (supply-side, $200k–$20M seasonal) and quick-pay for buyers; $38M Series D Feb 2024 (producepay.com; labusinessjournal.com). It is itself a marketplace — competitor/partner question.
- **John Deere Financial**: financing at point-of-action via the AgVend integration ecosystem (agvend.com, Nov 2022) — equipment financing model.

### 3. General embedded / bank POS lending
- **U.S. Bank Avvance** (top candidate): bank-owned embedded point-of-sale lending; loans $300–$25,000, terms 3–60 months; API-driven developer portal (low-code to headless); "U.S. Bank manages the consumer loan application process" — the bank owns decisioning, matching our model; distributed via Elavon (U.S. Bank acquiring) ISV channel; partner/merchant portal for marketing, invoicing, pricing, transaction tracking; first integrated partner LendPro (Oct 2025); longer 6–7-year terms added Mar 2026 (usbank.com Oct 21 2025; cloud.na.elavon.com/isv-payments-avvance; ir.usbank.com Mar 25 2026).
- **LendPro**: waterfall-based consumer finance platform, first Avvance integrated partner — an implementation pattern to study.
- **Jifiti / Amount**: embedded-lending plumbing banks use to offer checkout credit; the "one API, many bank partners" model — the shape for a multi-bank abstraction.

## Shortlist for the pilot (3–5)

1. **U.S. Bank Avvance** — bank-owned, API-driven, instant decisioning, the bank manages the application (exact fit for our standing decisions). Note: $25k/loan cap; LivestockP2P test data includes a $30,400 lot — the pilot either caps financed deals at $25k or adds a second candidate for larger tickets.
2. **Growers Edge** — best ag-domain fit for embedded financing, proven ag-retail integrations, but input-loan focus and partner-gated (no public API).
3. **A Farm Credit association** (FCSAmerica or Farm Credit Mid-America — both have livestock loan programs) — domain + brand fit; bespoke/branch-level partnership, no public API; slowest path, highest trust.
4. **John Deere Financial** — point-of-action financing in ag; equipment-focused; more a model than a candidate.
5. **Jifiti / Amount** — fastest multi-bank abstraction (several banks behind one integration); the platform is the partner, not a single bank.

## Verdict
U.S. Bank Avvance is the only shortlisted candidate with a public, documented, API-driven partnership program today — the pragmatic pilot. The multi-bank abstraction should follow the general embedded-lending pattern (one API surface, many bank partners), with Avvance as the first concrete provider.
