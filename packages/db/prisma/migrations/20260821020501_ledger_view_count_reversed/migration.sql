-- The balance view must count REVERSED originals together with their mirror
-- reversal entries: a reversal pair (original + mirror) nets to zero.
-- Excluding REVERSED originals would make the mirror alone change the
-- balance, corrupting the ledger.

DROP VIEW "LedgerAccountBalance";

CREATE VIEW "LedgerAccountBalance" AS
SELECT
  legs.account_id,
  SUM(legs.signed_amount)::bigint AS balance_cents
FROM (
  SELECT "debitAccountId" AS account_id, -"amountCents" AS signed_amount
    FROM "LedgerEntry" WHERE status IN ('COMMITTED', 'REVERSED')
  UNION ALL
  SELECT "creditAccountId" AS account_id,  "amountCents" AS signed_amount
    FROM "LedgerEntry" WHERE status IN ('COMMITTED', 'REVERSED')
) legs
GROUP BY legs.account_id;
