import { PaymentProviderError, WebhookVerificationError } from "./provider";
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
} from "./provider";

/**
 * Simulation rail for local development and demos. Activated only when
 * PAYMENTS_DRY_RUN=true — production never selects it, and it refuses to
 * operate on the webhook path so no forged events can be processed.
 *
 * It mirrors the FakeProvider test seam's idempotency contract: the same
 * idempotency key always returns the same reference, so retried settlement
 * jobs never double-move money.
 */
export class DryRunProvider implements PaymentProvider {
  readonly rail: "STRIPE" | "DWOLLA";

  private readonly transfers = new Map<string, TransferResult>();
  private readonly charges = new Map<string, ChargeResult>();
  private readonly refunds = new Map<string, TransferResult>();
  private balanceCents = 100_000_000_000;

  constructor(rail: "STRIPE" | "DWOLLA" = "STRIPE") {
    this.rail = rail;
  }

  async chargeAndHold(request: ChargeRequest): Promise<ChargeResult> {
    const existing = this.charges.get(request.idempotencyKey);
    if (existing) return existing;
    const result: ChargeResult = { status: "SUCCEEDED", railReferenceId: `dry_ch_${request.idempotencyKey}` };
    this.charges.set(request.idempotencyKey, result);
    return result;
  }

  async transferFromFbo(request: TransferRequest): Promise<TransferResult> {
    if (this.balanceCents < request.amountCents) {
      throw new PaymentProviderError("dry-run FBO balance exhausted", { retryable: false });
    }
    const existing = this.transfers.get(request.idempotencyKey);
    if (existing) return existing;
    const result: TransferResult = { status: "SUCCEEDED", railReferenceId: `dry_tr_${request.idempotencyKey}` };
    this.transfers.set(request.idempotencyKey, result);
    this.balanceCents -= request.amountCents;
    return result;
  }

  async refund(request: RefundRequest): Promise<TransferResult> {
    const existing = this.refunds.get(request.idempotencyKey);
    if (existing) return existing;
    const result: TransferResult = { status: "SUCCEEDED", railReferenceId: `dry_rf_${request.idempotencyKey}` };
    this.refunds.set(request.idempotencyKey, result);
    return result;
  }

  async getBalance(): Promise<Money> {
    return { amountCents: this.balanceCents, currency: "USD" };
  }

  verifyWebhook(_rawBody: string | Buffer, _headers: WebhookHeaders): NormalizedWebhookEvent {
    // Dry-run mode never ingests provider webhooks; the settlement path is
    // synchronous and simulated. Anything hitting this is a misconfiguration.
    throw new WebhookVerificationError("webhooks are not supported in dry-run mode");
  }

  async handleWebhookEvent(_event: NormalizedWebhookEvent): Promise<void> {
    throw new WebhookVerificationError("webhooks are not supported in dry-run mode");
  }
}
