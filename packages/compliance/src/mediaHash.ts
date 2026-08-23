import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { DomainError } from "@livestock/shared";
import { verifyHmacSignature } from "./webhookSignature";

/**
 * SHA-256 of a file's contents — computed at upload time and stored on the
 * Evidence row, then re-verified against object storage before a dispute is
 * adjudicated so a swapped file cannot be ruled on.
 */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Verified metadata flags attached to an Evidence row. Flags are only set by
 * this module after a provider-signed payload passes verification.
 */
export interface VerifiedEvidenceFlags {
  isVetCertified?: boolean;
  isScaleTicketVerified?: boolean;
  scaleNetWeightLbs?: number;
  ocrConfidence?: number;
  isTruepicVerified?: boolean;
  truepicMetadata?: Record<string, unknown>;
}

/**
 * Payload shape that partner webhooks must sign (HMAC-SHA256) before we will
 * trust any verification claim:
 *
 *   {
 *     evidenceId: "...",
 *     source: "SCALE_TICKET_OCR" | "VET_TELEHEALTH" | "TRUEPIC_CAPTURE",
 *     claims: { isVetCertified?, scaleNetWeightLbs?, ocrConfidence?, ... },
 *     issuedAt: <unix seconds>,
 *     nonce: "..."
 *   }
 */
export interface VerificationClaim {
  evidenceId: string;
  source: "SCALE_TICKET_OCR" | "VET_TELEHEALTH" | "TRUEPIC_CAPTURE";
  claims: Record<string, unknown>;
  issuedAt: number;
  nonce: string;
}

/**
 * Validate a signed claim and normalize it into VerifiedEvidenceFlags.
 * Signature verification happens here so no route handler can accidentally
 * trust an unsigned claim.
 */
export function acceptVerifiedClaim(
  payload: unknown,
  signature: string,
  secret: string,
  opts: { now?: Date } = {},
): VerifiedEvidenceFlags {
  const claim = payload as VerificationClaim | undefined;
  if (!claim || typeof claim !== "object" || typeof claim.evidenceId !== "string") {
    throw new DomainError("CLAIM_INVALID", "Verification claim payload is malformed");
  }
  verifyHmacSignature({
    rawBody: JSON.stringify(payload),
    signature,
    secret,
    timestampSeconds: claim.issuedAt,
    now: opts.now,
  });

  switch (claim.source) {
    case "VET_TELEHEALTH": {
      const certified = claim.claims.isVetCertified === true;
      return { isVetCertified: certified };
    }
    case "SCALE_TICKET_OCR": {
      const weight = claim.claims.scaleNetWeightLbs;
      if (typeof weight !== "number" || !Number.isSafeInteger(weight) || weight <= 0) {
        throw new DomainError("CLAIM_INVALID", "scaleNetWeightLbs must be a positive integer");
      }
      return {
        isScaleTicketVerified: true,
        scaleNetWeightLbs: weight,
        ocrConfidence:
          typeof claim.claims.ocrConfidence === "number" ? claim.claims.ocrConfidence : undefined,
      };
    }
    case "TRUEPIC_CAPTURE": {
      const authentic = claim.claims.isAuthentic === true;
      return {
        isTruepicVerified: authentic,
        truepicMetadata:
          typeof claim.claims.metadata === "object"
            ? (claim.claims.metadata as Record<string, unknown>)
            : undefined,
      };
    }
    default:
      throw new DomainError("CLAIM_UNSUPPORTED", `Unsupported claim source`);
  }
}
