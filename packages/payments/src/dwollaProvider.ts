import { Client } from "dwolla-v2";
import { PaymentProviderError, RailNotConfiguredError, WebhookVerificationError } from "./provider";
import { hmacSha256Hex, safeEqualHex } from "@livestock/compliance";
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
 * Dwolla ACH adapter.
 *
 * Money flows: transfers between funding sources.
 *  - chargeAndHold  : buyer funding source -> platform funding source.
 *  - transferFromFbo: platform funding source -> seller / hauler funding
 *                     source (ACH, settles in 3-5 business days — surfaced as
 *                     PENDING until the `transfer_completed` webhook).
 *  - refund         : platform funding source -> buyer funding source.
 *
 * Idempotency: Dwolla accepts an `Idempotency-Key` header on POST /transfers;
 * we also attach a correlationId in metadata for belt-and-braces.
 */
export class DwollaProvider implements PaymentProvider {
  readonly rail = "DWOLLA" as const;
  readonly client: Client;
  readonly platformFundingSourceUrl: string;
  readonly webhookSecret: string;

  constructor(opts: { key: string; secret: string; environment: "sandbox" | "production"; platformFundingSourceUrl: string; webhookSecret: string }) {
    this.client = new Client({
      key: opts.key,
      secret: opts.secret,
      environment: opts.environment,
    });
    this.platformFundingSourceUrl = opts.platformFundingSourceUrl;
    this.webhookSecret = opts.webhookSecret;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): DwollaProvider {
    const key = env.DWOLLA_KEY;
    const secret = env.DWOLLA_SECRET;
    const platformFundingSourceUrl = env.DWOLLA_PLATFORM_FUNDING_SOURCE_URL;
    const webhookSecret = env.DWOLLA_WEBHOOK_SECRET;
    const environment = env.DWOLLA_ENV === "production" ? "production" : "sandbox";
    if (!key) throw new RailNotConfiguredError("DWOLLA", "DWOLLA_KEY");
    if (!secret) throw new RailNotConfiguredError("DWOLLA", "DWOLLA_SECRET");
    if (!platformFundingSourceUrl) throw new RailNotConfiguredError("DWOLLA", "DWOLLA_PLATFORM_FUNDING_SOURCE_URL");
    if (!webhookSecret) throw new RailNotConfiguredError("DWOLLA", "DWOLLA_WEBHOOK_SECRET");
    return new DwollaProvider({ key, secret, environment, platformFundingSourceUrl, webhookSecret });
  }

  async chargeAndHold(request: ChargeRequest): Promise<ChargeResult> {
    const result = await this.#createTransfer({
      source: request.sourceAccountRef,
      destination: this.platformFundingSourceUrl,
      amountCents: request.amountCents,
      currency: request.currency,
      idempotencyKey: `charge-${request.idempotencyKey}`,
      metadata: request.metadata,
      operation: "chargeAndHold",
    });
    return result;
  }

  async transferFromFbo(request: TransferRequest): Promise<TransferResult> {
    const result = await this.#createTransfer({
      source: this.platformFundingSourceUrl,
      destination: request.destinationAccountRef,
      amountCents: request.amountCents,
      currency: request.currency,
      idempotencyKey: `settle-${request.idempotencyKey}`,
      metadata: request.metadata,
      operation: "transferFromFbo",
    });
    return result;
  }

  async refund(request: RefundRequest): Promise<TransferResult> {
    // Dwolla transfers are not linked to a prior transfer for refunds; a
    // refund is simply a new transfer from the platform back to the buyer.
    const result = await this.#createTransfer({
      source: this.platformFundingSourceUrl,
      destination: request.metadata.destinationAccountRef ?? "",
      amountCents: request.amountCents,
      currency: request.currency,
      idempotencyKey: `refund-${request.idempotencyKey}`,
      metadata: { ...request.metadata, chargeReferenceId: request.chargeReferenceId },
      operation: "refund",
    });
    return result;
  }

  async getBalance(): Promise<Money> {
    try {
      const res = await this.client.get(`${this.platformFundingSourceUrl}/balance`);
      const body = res.body as { balance?: { value?: string; currency?: string } };
      const dollars = Number(body.balance?.value ?? "0");
      return {
        amountCents: Math.round(dollars * 100),
        currency: (body.balance?.currency ?? "USD").toUpperCase(),
      };
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        // Some funding sources (e.g. unverified bank accounts) expose no balance.
        throw new PaymentProviderError("Dwolla funding source does not expose a balance", {
          retryable: false,
          cause: err,
        });
      }
      throw classifyDwollaError(err, "getBalance");
    }
  }

  verifyWebhook(rawBody: string | Buffer, headers: WebhookHeaders): NormalizedWebhookEvent {
    // Dwolla signs webhooks with X-Request-Signature-SHA-256 (current) — the
    // older `dwolla-signature` header is kept as a legacy fallback.
    const signature =
      asString(headers["x-request-signature-sha-256"]) ??
      asString(headers["x-request-signature-256"]) ??
      asString(headers["dwolla-signature"]);
    if (!signature) {
      throw new WebhookVerificationError("missing Dwolla webhook signature header");
    }
    const expected = hmacSha256Hex(rawBody, this.webhookSecret);
    if (!safeEqualHex(signature, expected)) {
      throw new WebhookVerificationError("Dwolla webhook signature mismatch");
    }
    let payload: { topic?: string; _links?: Record<string, { href?: string }> } | null = null;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new WebhookVerificationError("Dwolla webhook body is not valid JSON");
    }
    const topic = payload?.topic ?? "unknown";
    return {
      type: topic,
      railReferenceId: extractDwollaResourceId(payload?._links?.resource?.href),
      metadata: { resourceHref: payload?._links?.resource?.href ?? "" },
      raw: payload,
    };
  }

  async handleWebhookEvent(_event: NormalizedWebhookEvent): Promise<void> {
    return Promise.resolve();
  }

  async #createTransfer(args: {
    source: string;
    destination: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
    operation: string;
  }): Promise<TransferResult> {
    if (!args.destination) {
      throw new PaymentProviderError("Dwolla transfer destination is missing", { retryable: false });
    }
    try {
      const res = await this.client.post(
        "transfers",
        {
          _links: {
            source: { href: args.source },
            destination: { href: args.destination },
          },
          amount: {
            currency: args.currency,
            value: (args.amountCents / 100).toFixed(2),
          },
          metadata: {
            ...args.metadata,
            idempotencyKey: args.idempotencyKey,
            correlationId: `livestock-${args.idempotencyKey}`,
          },
        },
        { "Idempotency-Key": args.idempotencyKey },
      );
      const location = res.headers.get("location");
      const transferId = location ? location.split("/").pop() ?? "" : "";
      const body = res.body as { status?: string };
      const status = body.status === "processing" || body.status === "pending" ? "PENDING" : "SUCCEEDED";
      return { status, railReferenceId: transferId };
    } catch (err) {
      throw classifyDwollaError(err, args.operation);
    }
  }
}

function classifyDwollaError(err: unknown, operation: string): never {
  if (err instanceof PaymentProviderError) throw err;
  const status = (err as { status?: number }).status;
  const body = (err as { body?: { code?: string; message?: string } }).body;
  const retryable = status === undefined || status === 429 || status >= 500;
  throw new PaymentProviderError(`${operation} failed: ${body?.message ?? (err as Error).message}`, {
    retryable,
    cause: err,
    details: { status, code: body?.code },
  });
}

function extractDwollaResourceId(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const parts = href.split("/");
  return parts[parts.length - 1];
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
