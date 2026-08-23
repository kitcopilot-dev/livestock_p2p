import Stripe from "stripe";
import { WebhookVerificationError, PaymentProviderError, RailNotConfiguredError } from "./provider";
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
 * Stripe Connect adapter.
 *
 * Money flows:
 *  - chargeAndHold  : PaymentIntent captured to the PLATFORM balance (FBO).
 *  - transferFromFbo: `transfers.create` from the platform balance to a
 *                     connected account (seller / hauler), grouped with
 *                     `transfer_group` for full audit trail.
 *  - refund         : `refunds.create` against the original PaymentIntent.
 *
 * Idempotency: every call carries an `Idempotency-Key` derived from our own
 * PaymentIntent row id, so a retried job can never double-move money.
 */
export class StripeProvider implements PaymentProvider {
  readonly rail = "STRIPE" as const;
  readonly stripe: Stripe;
  readonly platformAccountId: string;
  readonly webhookSecret: string;

  constructor(opts: {
    secretKey: string;
    platformAccountId: string;
    webhookSecret: string;
  }) {
    this.stripe = new Stripe(opts.secretKey);
    this.platformAccountId = opts.platformAccountId;
    this.webhookSecret = opts.webhookSecret;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): StripeProvider {
    const secretKey = env.STRIPE_SECRET_KEY;
    const platformAccountId = env.STRIPE_PLATFORM_ACCOUNT_ID;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey) throw new RailNotConfiguredError("STRIPE", "STRIPE_SECRET_KEY");
    if (!platformAccountId) throw new RailNotConfiguredError("STRIPE", "STRIPE_PLATFORM_ACCOUNT_ID");
    if (!webhookSecret) throw new RailNotConfiguredError("STRIPE", "STRIPE_WEBHOOK_SECRET");
    return new StripeProvider({ secretKey, platformAccountId, webhookSecret });
  }

  async chargeAndHold(request: ChargeRequest): Promise<ChargeResult> {
    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: request.amountCents,
          currency: request.currency,
          payment_method: request.sourceAccountRef,
          confirm: true,
          capture_method: "automatic",
          // Funds land on the platform balance (our FBO/escrow account).
          transfer_data: { destination: this.platformAccountId },
          metadata: { ...request.metadata, idempotencyKey: request.idempotencyKey },
        },
        { idempotencyKey: `charge-${request.idempotencyKey}` },
      );
      if (intent.status === "succeeded") {
        return { status: "SUCCEEDED", railReferenceId: intent.id };
      }
      if (intent.status === "processing") {
        return { status: "PENDING", railReferenceId: intent.id };
      }
      throw new PaymentProviderError(
        `PaymentIntent ended in unexpected state ${intent.status}`,
        { retryable: true, details: { id: intent.id } },
      );
    } catch (err) {
      throw classifyStripeError(err, "chargeAndHold");
    }
  }

  async transferFromFbo(request: TransferRequest): Promise<TransferResult> {
    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount: request.amountCents,
          currency: request.currency,
          destination: request.destinationAccountRef,
          transfer_group: request.metadata.escrowId ?? "unknown-escrow",
          metadata: { ...request.metadata, idempotencyKey: request.idempotencyKey },
        },
        { idempotencyKey: `settle-${request.idempotencyKey}` },
      );
      return { status: "SUCCEEDED", railReferenceId: transfer.id };
    } catch (err) {
      throw classifyStripeError(err, "transferFromFbo");
    }
  }

  async refund(request: RefundRequest): Promise<TransferResult> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: request.chargeReferenceId,
          amount: request.amountCents,
          metadata: { ...request.metadata, idempotencyKey: request.idempotencyKey },
        },
        { idempotencyKey: `refund-${request.idempotencyKey}` },
      );
      return { status: "SUCCEEDED", railReferenceId: refund.id };
    } catch (err) {
      throw classifyStripeError(err, "refund");
    }
  }

  async getBalance(): Promise<Money> {
    try {
      const balance = await this.stripe.balance.retrieve();
      const available = balance.available[0];
      return {
        amountCents: available?.amount ?? 0,
        currency: available?.currency ?? "usd",
      };
    } catch (err) {
      throw classifyStripeError(err, "getBalance");
    }
  }

  verifyWebhook(rawBody: string | Buffer, headers: WebhookHeaders): NormalizedWebhookEvent {
    const sigHeader = asString(headers["stripe-signature"]);
    if (!sigHeader) {
      throw new WebhookVerificationError("missing stripe-signature header");
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sigHeader, this.webhookSecret);
    } catch (err) {
      throw new WebhookVerificationError(`Stripe signature verification failed: ${(err as Error).message}`);
    }
    return normalizeStripeEvent(event);
  }

  async handleWebhookEvent(_event: NormalizedWebhookEvent): Promise<void> {
    // Stripe events are handled by the orchestrator in webhook.ts — the
    // normalized shape carries everything needed (metadata escrow ids, rail
    // reference ids, statuses).
    return Promise.resolve();
  }
}

function normalizeStripeEvent(event: Stripe.Event): NormalizedWebhookEvent {
  const obj = event.data.object as { id?: string; status?: string; metadata?: Record<string, string> } | null;
  return {
    type: event.type,
    railReferenceId: obj?.id,
    status: obj?.status,
    metadata: obj?.metadata ?? undefined,
    raw: event,
  };
}

function classifyStripeError(err: unknown, operation: string): never {
  if (err instanceof PaymentProviderError) throw err;
  if (err instanceof Stripe.errors.StripeError) {
    const retryable =
      err.type === "StripeConnectionError" ||
      err.type === "StripeAPIError" ||
      err.code === "rate_limit_error" ||
      err.code === "idempotency_error" ||
      (err.statusCode !== undefined && err.statusCode >= 500);
    throw new PaymentProviderError(`${operation} failed: ${err.message}`, {
      retryable,
      cause: err,
      details: { type: err.type, code: err.code, statusCode: err.statusCode },
    });
  }
  throw new PaymentProviderError(`${operation} failed: ${(err as Error).message}`, {
    retryable: true,
    cause: err,
  });
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
