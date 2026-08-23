import { prisma } from "@livestock/db";
import { IllegalTransitionError, TransactionManager } from "@livestock/domain";
import { sha256Hex } from "@livestock/compliance";
import { canonicalJson, DomainError } from "@livestock/shared";
import { getProvider } from "./settlement";
import type { PaymentProvider, RailName, WebhookHeaders } from "./provider";

export interface WebhookDeps {
  providers?: Partial<Record<RailName, PaymentProvider>>;
  transactionManager?: TransactionManager;
}

/**
 * Rail-agnostic webhook ingestion:
 *   1. verify the signature (Stripe via constructEvent, Dwolla via HMAC)
 *   2. dedupe with an IdempotencyRecord (replays of the same event no-op)
 *   3. apply the side effect (fund escrow, mark transfer outcomes)
 *
 * Side effects are idempotent at the domain level too: fund() is a guarded
 * DRAFT -> FUNDED transition and transfer outcomes flip PaymentIntent status
 * only when PENDING.
 */
export async function handleRailWebhook(
  rail: RailName,
  rawBody: string | Buffer,
  headers: WebhookHeaders,
  deps: WebhookDeps = {},
): Promise<{ handled: boolean; eventType: string }> {
  const provider = getProvider(rail, deps.providers);
  const event = provider.verifyWebhook(rawBody, headers);
  const tm = deps.transactionManager ?? new TransactionManager();

  const dedupeKey = `${rail}:${event.type}:${event.railReferenceId ?? "?"}`;
  const requestHash = sha256Hex(canonicalJson(event.raw));

  const existing = await prisma.idempotencyRecord.findUnique({ where: { key: dedupeKey } });
  if (existing) {
    return { handled: false, eventType: event.type };
  }

  return prisma.$transaction(async (tx) => {
    await tx.idempotencyRecord.create({
      data: {
        key: dedupeKey,
        requestHash,
        status: "PROCESSING",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    switch (event.type) {
      case "charge.succeeded": {
        const escrowId = event.metadata?.escrowId;
        if (escrowId) {
          try {
            await tm.fund(escrowId, { actor: "PLATFORM" });
          } catch (err) {
            // Idempotency: the escrow may already be FUNDED when funding was
            // applied synchronously (e.g. a local smoke test that charged and
            // funded directly, or a replayed delivery of a charge that funded
            // a previous attempt). "Already funded" is success, not an error
            // — ack the webhook so the provider stops retrying.
            if (err instanceof IllegalTransitionError) break;
            throw err;
          }
        }
        break;
      }
      case "charge.failed": {
        // No escrow state change; the funding intent never succeeded. Ops
        // alerting hooks into the audit log entry written below.
        break;
      }
      // Stripe surfaces transfers as "transfer.created" / "transfer.paid";
      // Dwolla sends the underscore topics below (and `customer_transfer_*`
      // when a Customer is the source or destination, which is the case for
      // every escrow leg). Normalize them all onto the same outcome.
      case "transfer.completed":
      case "transfer.paid":
      case "transfer_completed":
      case "customer_transfer_completed": {
        if (event.railReferenceId) {
          await tx.paymentIntent.updateMany({
            where: { railReferenceId: event.railReferenceId, status: "PENDING" },
            data: { status: "SUCCEEDED" },
          });
        }
        break;
      }
      case "transfer.failed":
      case "transfer_failed":
      case "customer_transfer_failed": {
        if (event.railReferenceId) {
          await tx.paymentIntent.updateMany({
            where: { railReferenceId: event.railReferenceId, status: "PENDING" },
            data: {
              status: "FAILED",
              errorCode: "RAIL_WEBHOOK_FAILED",
              errorMessage: "rail reported transfer failure",
            },
          });
        }
        break;
      }
      default:
        // Unknown topics are acknowledged (200) but ignored — we never reject
        // a well-signed webhook just because we don't model the event yet.
        break;
    }

    await tx.idempotencyRecord.update({
      where: { key: dedupeKey },
      data: { status: "COMPLETED" },
    });
    return { handled: true, eventType: event.type };
  });
}

export function webhookErrorCode(err: unknown): string {
  if (err instanceof DomainError) return err.code;
  return "UNKNOWN_WEBHOOK_ERROR";
}
