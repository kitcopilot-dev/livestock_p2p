import { hmacSha256Hex, safeEqualHex } from "@livestock/compliance";
import { PaymentProviderError, WebhookVerificationError } from "../provider";
import type {
  ChargeRequest,
  ChargeResult,
  Money,
  NormalizedWebhookEvent,
  PaymentProvider,
  RefundRequest,
  TransferRequest,
  TransferResult,
  WebhookHeaders,
} from "../provider";

/**
 * In-memory PaymentProvider used by tests and sandbox environments. It is a
 * test SEAM for the rail boundary — it faithfully implements idempotency
 * (same key -> same result, no duplicate execution) and lets tests inject
 * deterministic transient/permanent failures.
 */
export class FakeProvider implements PaymentProvider {
  readonly rail;
  readonly webhookSecret: string;

  /** idempotencyKey -> recorded transfer (dedupes duplicate calls). */
  readonly transfers = new Map<string, { request: TransferRequest; result: TransferResult }>();
  readonly charges = new Map<string, { request: ChargeRequest; result: ChargeResult }>();

  failNextTransfer: { retryable: boolean; message: string } | null = null;
  failTransfersWithKey: { key: string; retryable: boolean; message: string } | null = null;
  balanceCents = 1_000_000_000;
  /** When true, transfers report PENDING (simulates Dwolla ACH latency). */
  achLatency = false;

  constructor(rail: "STRIPE" | "DWOLLA" = "STRIPE", webhookSecret = "test-secret") {
    this.rail = rail;
    this.webhookSecret = webhookSecret;
  }

  async chargeAndHold(request: ChargeRequest): Promise<ChargeResult> {
    const existing = this.charges.get(request.idempotencyKey);
    if (existing) return existing.result;
    const result: ChargeResult = { status: "SUCCEEDED", railReferenceId: `ch_${request.idempotencyKey}` };
    this.charges.set(request.idempotencyKey, { request, result });
    return result;
  }

  async transferFromFbo(request: TransferRequest): Promise<TransferResult> {
    const existing = this.transfers.get(request.idempotencyKey);
    if (existing) return existing.result;

    if (this.failTransfersWithKey && request.idempotencyKey === this.failTransfersWithKey.key) {
      throw new PaymentProviderError(this.failTransfersWithKey.message, {
        retryable: this.failTransfersWithKey.retryable,
      });
    }
    if (this.failNextTransfer) {
      const f = this.failNextTransfer;
      this.failNextTransfer = null;
      throw new PaymentProviderError(f.message, { retryable: f.retryable });
    }

    this.balanceCents -= request.amountCents;
    const result: TransferResult = {
      status: this.achLatency ? "PENDING" : "SUCCEEDED",
      railReferenceId: `tr_${request.idempotencyKey}`,
    };
    this.transfers.set(request.idempotencyKey, { request, result });
    return result;
  }

  async refund(request: RefundRequest): Promise<TransferResult> {
    const result: TransferResult = { status: "SUCCEEDED", railReferenceId: `rf_${request.idempotencyKey}` };
    return result;
  }

  async getBalance(): Promise<Money> {
    return { amountCents: this.balanceCents, currency: "USD" };
  }

  verifyWebhook(rawBody: string | Buffer, headers: WebhookHeaders): NormalizedWebhookEvent {
    const signature = (headers["x-signature"] as string | undefined) ?? "";
    const expected = hmacSha256Hex(rawBody, this.webhookSecret);
    if (!signature || !safeEqualHex(signature, expected)) {
      throw new WebhookVerificationError("signature mismatch");
    }
    const payload = JSON.parse(rawBody.toString("utf8")) as {
      type: string;
      id?: string;
      metadata?: Record<string, string>;
    };
    return {
      type: payload.type,
      railReferenceId: payload.id,
      metadata: payload.metadata,
      raw: payload,
    };
  }

  async handleWebhookEvent(_event: NormalizedWebhookEvent): Promise<void> {
    return Promise.resolve();
  }
}

/** Helper: build a signed FakeProvider webhook body for tests. */
export function signedWebhookBody(provider: FakeProvider, payload: unknown): { body: string; headers: WebhookHeaders } {
  const body = JSON.stringify(payload);
  const signature = hmacSha256Hex(body, provider.webhookSecret);
  return { body, headers: { "x-signature": signature } };
}
