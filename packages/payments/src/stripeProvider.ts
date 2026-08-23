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

  /**
   * Create a new Stripe Connect custom connected account for a user.
   * Returns the account ID (acct_xxx). The user must complete onboarding
   * via an AccountLink before they can receive transfers.
   */
  async createConnectedAccount(opts: {
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const account = await this.stripe.accounts.create({
      type: "custom",
      country: "US",
      email: opts.email,
      business_type: "individual",
      individual: { first_name: opts.firstName, last_name: opts.lastName },
      capabilities: { transfers: { requested: true } },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
      metadata: { platform: "livestock-p2p" },
    });
    return account.id;
  }

  /**
   * Generate an AccountLink for a connected account's onboarding.
   * The user is redirected to Stripe-hosted onboarding, then returns
   * to the refresh or return URL.
   */
  async createAccountLink(accountId: string, opts: {
    refreshUrl: string;
    returnUrl: string;
  }): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: opts.refreshUrl,
      return_url: opts.returnUrl,
      type: "account_onboarding",
    });
    return link.url;
  }

  /**
   * Check if a connected account has completed onboarding.
   */
  async getOnboardingStatus(accountId: string): Promise<{
    isComplete: boolean;
    currentlyDue: string[];
    errors: string[];
  }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {
      isComplete: account.charges_enabled && account.payouts_enabled,
      currentlyDue: account.requirements?.currently_due ?? [],
      errors: (account.requirements?.errors ?? []).map((e) => (e as any).message ?? "unknown error"),
    };
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
