import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livestock/db";
import { seedParty, truncateAll } from "@livestock/db/testing";
import { TransactionManager } from "@livestock/domain";
import { hmacSha256Hex } from "@livestock/compliance";
import { handleRailWebhook } from "../src/webhook";
import { FakeProvider } from "../src/testing/fakeProvider";
import type { PaymentProvider, WebhookHeaders } from "../src/provider";

/**
 * A FakeProvider subclass that verifies the Dwolla-style signature header
 * (`x-request-signature-sha-256`) instead of the Stripe-style `x-signature`.
 * This lets us test the Dwolla webhook ingestion path end-to-end through
 * handleRailWebhook without hitting a real Dwolla sandbox.
 */
class DwollaFakeProvider extends FakeProvider {
  constructor(webhookSecret = "test-dwolla-secret") {
    super("DWOLLA", webhookSecret);
  }

  verifyWebhook(rawBody: string | Buffer, headers: WebhookHeaders) {
    // Mirror the DwollaProvider's header lookup order.
    const signature =
      (headers["x-request-signature-sha-256"] as string | undefined) ??
      (headers["x-request-signature-256"] as string | undefined) ??
      (headers["dwolla-signature"] as string | undefined) ??
      "";
    const expected = hmacSha256Hex(rawBody, this.webhookSecret);
    if (!signature || signature !== expected) {
      throw new Error("Dwolla webhook signature mismatch");
    }
    const payload = JSON.parse(rawBody.toString("utf8")) as {
      topic: string;
      _links?: { resource?: { href?: string } };
      [key: string]: unknown;
    };
    const railReferenceId = payload._links?.resource?.href
      ?.split("/")
      .pop();
    return {
      type: payload.topic,
      railReferenceId,
      metadata: { resourceHref: payload._links?.resource?.href ?? "" },
      raw: payload,
    };
  }
}

function signBody(provider: DwollaFakeProvider, body: string): WebhookHeaders {
  const sig = hmacSha256Hex(body, provider.webhookSecret);
  return { "x-request-signature-sha-256": sig };
}

// --- Shared test fixtures ---------------------------------------------------

const SECRET = "test-dwolla-webhook-secret";
let provider: DwollaFakeProvider;
let tm: TransactionManager;
let buyer: { id: string };
let seller: { id: string };
let hauler: { id: string };

beforeAll(async () => {
  await truncateAll();
  buyer = await seedParty("BUYER", "acct_test_buyer");
  seller = await seedParty("SELLER", "acct_test_seller");
  hauler = await seedParty("HAULER", "acct_test_hauler");
  tm = new TransactionManager();
  provider = new DwollaFakeProvider(SECRET);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createFundedEscrow() {
  const draft = await tm.createDraft({
    buyerId: buyer.id,
    sellerId: seller.id,
    haulerId: hauler.id,
    saleAmountCents: 50_000,
    contractedWeightLbs: 2_000,
    freightFeeCents: 2_500,
    platformFeeBps: 250,
  });
  await tm.fund(draft.id, { actor: "PLATFORM" });
  return draft;
}

// --- Tests -----------------------------------------------------------------

describe("Dwolla webhook ingestion", () => {
  it("accepts x-request-signature-sha-256 header (Dwolla's signing header)", async () => {
    const body = JSON.stringify({
      topic: "transfer_completed",
      _links: { resource: { href: "https://api-sandbox.dwolla.com/transfers/aaa-bbb" } },
    });
    const headers = signBody(provider, body);

    const result = await handleRailWebhook("DWOLLA", body, headers, {
      providers: { DWOLLA: provider as unknown as PaymentProvider },
    });

    expect(result.handled).toBe(true);
    expect(result.eventType).toBe("transfer_completed");
  });

  it("rejects a webhook with the wrong signature header name (Stripe-style x-signature)", async () => {
    const body = JSON.stringify({
      topic: "transfer_completed",
      _links: { resource: { href: "https://api-sandbox.dwolla.com/transfers/wrong-header" } },
    });
    const sig = hmacSha256Hex(body, SECRET);
    // Pass the Stripe header name — DwollaFakeProvider should NOT find it.
    const headers: WebhookHeaders = { "x-signature": sig };

    await expect(
      handleRailWebhook("DWOLLA", body, headers, {
        providers: { DWOLLA: provider as unknown as PaymentProvider },
      }),
    ).rejects.toThrow(/signature mismatch/i);
  });

  it("processes transfer_completed topic and flips PENDING intents to SUCCEEDED", async () => {
    const escrow = await createFundedEscrow();

    // Create a PENDING transfer intent to be resolved by the webhook.
    const intent = await prisma.paymentIntent.create({
      data: {
        id: `pi_webhook_test_1`,
        escrowId: escrow.id,
        rail: "DWOLLA",
        railOperation: "TRANSFER",
        status: "PENDING",
        idempotencyKey: "settle:pi_webhook_test_1",
        amountCents: 40_000,
        currency: "USD",
        destinationAccountRef: "https://api-sandbox.dwolla.com/funding-sources/seller",
        railReferenceId: "dwolla_transfer_111",
      },
    });

    const body = JSON.stringify({
      topic: "transfer_completed",
      _links: { resource: { href: "https://api-sandbox.dwolla.com/transfers/dwolla_transfer_111" } },
    });
    const headers = signBody(provider, body);

    const result = await handleRailWebhook("DWOLLA", body, headers, {
      providers: { DWOLLA: provider as unknown as PaymentProvider },
    });

    expect(result.handled).toBe(true);
    const updated = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    expect(updated?.status).toBe("SUCCEEDED");
  });

  it("processes customer_transfer_completed topic identically to transfer_completed", async () => {
    const escrow = await createFundedEscrow();

    const intent = await prisma.paymentIntent.create({
      data: {
        id: `pi_webhook_test_2`,
        escrowId: escrow.id,
        rail: "DWOLLA",
        railOperation: "TRANSFER",
        status: "PENDING",
        idempotencyKey: "settle:pi_webhook_test_2",
        amountCents: 40_000,
        currency: "USD",
        destinationAccountRef: "https://api-sandbox.dwolla.com/funding-sources/hauler",
        railReferenceId: "dwolla_transfer_222",
      },
    });

    const body = JSON.stringify({
      topic: "customer_transfer_completed",
      _links: { resource: { href: "https://api-sandbox.dwolla.com/transfers/dwolla_transfer_222" } },
    });
    const headers = signBody(provider, body);

    const result = await handleRailWebhook("DWOLLA", body, headers, {
      providers: { DWOLLA: provider as unknown as PaymentProvider },
    });

    expect(result.handled).toBe(true);
    expect(result.eventType).toBe("customer_transfer_completed");
    const updated = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    expect(updated?.status).toBe("SUCCEEDED");
  });

  it("treats an already-funded escrow as a no-op (charge.succeeded replay)", async () => {
    const escrow = await createFundedEscrow();
    // escrow is already FUNDED — a late charge.succeeded webhook should not throw.

    const body = JSON.stringify({
      topic: "charge.succeeded",
      _links: { resource: { href: "" } },
      metadata: { escrowId: escrow.id },
    });
    const headers = signBody(provider, body);

    const result = await handleRailWebhook("DWOLLA", body, headers, {
      providers: { DWOLLA: provider as unknown as PaymentProvider },
    });

    // Should be handled without error — the IllegalTransitionError is swallowed.
    expect(result.handled).toBe(true);
    expect(result.eventType).toBe("charge.succeeded");
    // Escrow status unchanged.
    const refreshed = await prisma.escrowTransaction.findUnique({ where: { id: escrow.id } });
    expect(refreshed?.status).toBe("FUNDED");
  });

  it("deduplicates repeated webhooks for the same event", async () => {
    const escrow = await createFundedEscrow();

    const intent = await prisma.paymentIntent.create({
      data: {
        id: `pi_webhook_test_3`,
        escrowId: escrow.id,
        rail: "DWOLLA",
        railOperation: "TRANSFER",
        status: "PENDING",
        idempotencyKey: "settle:pi_webhook_test_3",
        amountCents: 40_000,
        currency: "USD",
        destinationAccountRef: "https://api-sandbox.dwolla.com/funding-sources/seller",
        railReferenceId: "dwolla_transfer_333",
      },
    });

    const body = JSON.stringify({
      topic: "transfer_completed",
      _links: { resource: { href: "https://api-sandbox.dwolla.com/transfers/dwolla_transfer_333" } },
    });
    const headers = signBody(provider, body);
    const providers = { DWOLLA: provider as unknown as PaymentProvider };

    // First delivery: handled.
    const first = await handleRailWebhook("DWOLLA", body, headers, { providers });
    expect(first.handled).toBe(true);

    // Second delivery: deduplicated (IdempotencyRecord already exists).
    const second = await handleRailWebhook("DWOLLA", body, headers, { providers });
    expect(second.handled).toBe(false);

    // Intent still SUCCEEDED, not double-processed.
    const updated = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    expect(updated?.status).toBe("SUCCEEDED");
  });
});
