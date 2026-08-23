# User Stories — Livestock P2P Escrow Platform

## Buyer (Test Buyer)

### US-B1: Browse Marketplace Listings
**As a** buyer,
**I want to** browse available livestock listings on the marketplace,
**so that** I can find animals that meet my operation's needs.

**Acceptance Criteria:**
- Landing page shows available listings with species, breed, weight, and price
- Each listing card shows the seller and a "View Details" action
- Listings in DRAFT or PENDING status are visible; SOLD listings are hidden

### US-B2: Create an Escrow from a Listing
**As a** buyer,
**I want to** accept a listing and create an escrow-protected transaction,
**so that** my funds are held safely until delivery is verified.

**Acceptance Criteria:**
- Clicking "Accept" on a listing opens the escrow creation form
- Form pre-fills sale amount, freight fee, and weight from the listing
- Escrow is created in DRAFT status with buyer, seller, and hauler assigned
- Buyer is redirected to the escrow detail page

### US-B3: Fund the Escrow
**As a** buyer,
**I want to** fund the escrow so the seller and hauler know the deal is live,
**so that** the transport leg can begin.

**Acceptance Criteria:**
- "Fund escrow" button is visible when escrow is in DRAFT status and user has BUYER or PLATFORM role
- Clicking "Fund" moves escrow to FUNDED status
- In real-rail mode (PAYMENTS_DRY_RUN=false), the buyer's funding source is charged
- In dry-run mode, the fund is simulated (state-only, no rail call)
- A success notice appears and the page refreshes to show FUNDED status

### US-B4: Cancel an Unfunded Escrow
**As a** buyer,
**I want to** cancel an escrow that hasn't been funded yet,
**so that** I can back out of a deal before money moves.

**Acceptance Criteria:**
- "Cancel escrow" button (red/danger tone) appears when escrow is FUNDED and user is BUYER or PLATFORM
- Cancellation moves escrow to CANCELED status
- Funds are not charged if escrow was not yet funded

### US-B5: File a Dispute After Delivery
**As a** buyer,
**I want to** file a dispute if the delivered livestock doesn't match the contract,
**so that** the platform can arbitrate and protect my payment.

**Acceptance Criteria:**
- During INSPECTION_PERIOD, buyer sees a dispute form with reason dropdown and details field
- Reasons include: Quality, Weight shrink, Vet certification, Non-delivery, Damaged, Other
- Filing a dispute moves escrow to DISPUTED status
- Dispute proof deadline is scheduled

---

## Seller (Test Seller)

### US-S1: View Escrow Details
**As a** seller,
**I want to** see the escrow status and transaction details for my listings,
**so that** I know when funds are locked and when I'll be paid.

**Acceptance Criteria:**
- Escrow detail page shows status badge, sale amount, freight fee, platform fee
- Settlement breakdown is visible after resolution
- Seller can see their payout amount in the breakdown

### US-S2: Receive Settlement After Inspection Clears
**As a** seller,
**I want to** receive my payout automatically after the buyer's inspection window passes without dispute,
**so that** I get paid promptly.

**Acceptance Criteria:**
- After 24h inspection window (or accelerated demo speed), escrow auto-releases
- Settlement transfers seller's share to their rail account
- Escrow moves to RESOLVED_RELEASED status
- Seller payout appears in the settlement breakdown

---

## Hauler (Test Hauler)

### US-H1: Accept a Transport Load
**As a** hauler,
**I want to** accept the transport leg of a funded escrow,
**so that** I can pick up and deliver the livestock.

**Acceptance Criteria:**
- Load board shows open loads linked to FUNDED escrows
- "Accept" button assigns the hauler to the load
- Load status moves to ACCEPTED

### US-H2: Mark Shipment In Transit
**As a** hauler,
**I want to** mark a shipment as in transit once I've picked up the livestock,
**so that** the buyer knows the animals are on the way.

**Acceptance Criteria:**
- "Mark in transit" button appears when escrow is FUNDED and user is HAULER or PLATFORM
- Action moves escrow to IN_TRANSIT status
- Seller and buyer can see the updated status

### US-H3: Mark Delivery with Weight
**As a** hauler,
**I want to** record the delivered weight when I drop off the livestock,
**so that** the inspection window starts and any weight shrink is calculated.

**Acceptance Criteria:**
- Weight input field and "Mark delivered" button appear when escrow is IN_TRANSIT
- Default weight is the contracted weight; hauler can adjust
- Action moves escrow to INSPECTION_PERIOD with a 24h (or demo-accelerated) deadline
- Inspection timeout job is scheduled

### US-H4: Receive Freight Payout
**As a** hauler,
**I want to** receive my freight fee after settlement,
**so that** I'm compensated for the transport.

**Acceptance Criteria:**
- After settlement, hauler's freight payout is transferred to their rail account
- Payout amount matches the contracted freight fee (minus any shrink penalty)
- Hauler can see their payout in the settlement breakdown

---

## Platform Operator

### US-P1: Arbitrate Disputes
**As a** platform operator,
**I want to** resolve disputes between buyers and sellers with a fair split,
**so that** all parties are treated equitably.

**Acceptance Criteria:**
- DISPUTED escrows can be escalated to ARBITRATION_PROCESSING
- Platform sees three resolution options: Buyer wins, Seller wins, Split
- Resolution triggers settlement with the appropriate payout vector
- Split divides proceeds (default: 50/50 of sale minus platform fee and freight)

### US-P2: Monitor Platform Settings
**As a** platform operator,
**I want to** view and adjust platform economics (fee bps, weight tolerance, payout rail),
**so that** the platform stays profitable and fair.

**Acceptance Criteria:**
- Settings page shows current values for platform fee, weight tolerance, freight estimate
- Payout rail selector (Stripe / Dwolla) changes the default settlement rail
- All changes are audit-logged with hash-chain integrity
- Rail provisioning section shows test user onboarding status
