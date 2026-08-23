import { DomainError } from "@livestock/shared";

/**
 * Payment rail abstraction. The settlement orchestrator talks ONLY to this
 * interface; Stripe and Dwolla are full adapters behind it, and tests use an
 * in-memory double. Plaid is a bank-data verification layer (complements
 * these rails) — see compliance/kyc.ts and ARCHITECTURE.md.
 */

export type RailName = "STRIPE" | "DWOLLA";

export interface Money {
  amountCents: number;
  currency: string;
}

export interface ChargeRequest {
  /** Buyer-side funding source (Stripe payment method id / Dwolla URL). */
  sourceAccountRef: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface ChargeResult {
  status: "SUCCEEDED" | "PENDING";
  railReferenceId: string;
}

export interface TransferRequest {
  /** Destination (Stripe connected account id / Dwolla funding source URL). */
  destinationAccountRef: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface TransferResult {
  /** DWOLLA ACH transfers start as PENDING (3-5 business day settlement). */
  status: "SUCCEEDED" | "PENDING";
  railReferenceId: string;
}

export interface RefundRequest {
  chargeReferenceId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

/** Normalized webhook event — the orchestrator never sees rail-specific shapes. */
export interface NormalizedWebhookEvent {
  /** e.g. "charge.succeeded", "transfer.completed", "transfer.failed" */
  type: string;
  railReferenceId?: string;
  status?: string;
  metadata?: Record<string, string>;
  raw: unknown;
}

export interface WebhookHeaders {
  [key: string]: string | string[] | undefined;
}

export interface PaymentProvider {
  readonly rail: RailName;
  /** Capture buyer funds into the platform FBO/escrow balance. */
  chargeAndHold(request: ChargeRequest): Promise<ChargeResult>;
  /** Move funds from the platform FBO balance to a destination account. */
  transferFromFbo(request: TransferRequest): Promise<TransferResult>;
  refund(request: RefundRequest): Promise<TransferResult>;
  /** Platform FBO balance. */
  getBalance(): Promise<Money>;
  /**
   * Verify the webhook signature and normalize the event. Throws
   * WebhookVerificationError on invalid signatures.
   */
  verifyWebhook(rawBody: string | Buffer, headers: WebhookHeaders): NormalizedWebhookEvent;
  /** Idempotently apply a normalized webhook event. */
  handleWebhookEvent(event: NormalizedWebhookEvent): Promise<void>;
}

export class PaymentProviderError extends DomainError {
  constructor(message: string, opts: { retryable: boolean; cause?: unknown; details?: Record<string, unknown> }) {
    super("PAYMENT_PROVIDER_ERROR", message, { retryable: opts.retryable, cause: opts.cause, details: opts.details });
  }
}

export class WebhookVerificationError extends DomainError {
  constructor(message: string) {
    super("WEBHOOK_VERIFICATION_FAILED", message, { retryable: false });
  }
}

export class RailNotConfiguredError extends DomainError {
  constructor(rail: string, missing: string) {
    super("RAIL_NOT_CONFIGURED", `${rail} provider is missing configuration: ${missing}`);
  }
}
