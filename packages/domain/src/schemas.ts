import { z } from "zod";

/**
 * Zod schemas for every external input. Route handlers validate with these
 * BEFORE touching the TransactionManager, so domain code only sees valid data.
 */

export const createDraftSchema = z.object({
  buyerId: z.string().min(1),
  sellerId: z.string().min(1),
  haulerId: z.string().min(1),
  saleAmountCents: z.number().int().positive().max(1_000_000_000), // $10M cap
  contractedWeightLbs: z.number().int().positive().max(10_000_000),
  weightTolerancePct: z.number().int().min(0).max(50).default(2),
  freightFeeCents: z.number().int().nonnegative(),
  platformFeeBps: z.number().int().min(0).max(10_000),
});
export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const markDeliveredSchema = z.object({
  deliveredWeightLbs: z.number().int().positive().nullable().optional(),
});
export type MarkDeliveredInput = z.infer<typeof markDeliveredSchema>;

export const fileDisputeSchema = z.object({
  reason: z.enum(["QUALITY", "WEIGHT_SHRINK", "VET_CERTIFICATION", "NON_DELIVERY", "DAMAGED", "OTHER"]),
  description: z.string().max(4000).optional(),
});
export type FileDisputeInput = z.infer<typeof fileDisputeSchema>;

export const addEvidenceSchema = z.object({
  disputeId: z.string().min(1),
  escrowId: z.string().min(1),
  uploaderId: z.string().min(1),
  source: z.enum(["UPLOAD", "SCALE_TICKET_OCR", "VET_TELEHEALTH", "TRUEPIC_CAPTURE"]),
  fileType: z.enum(["IMAGE", "PDF", "JSON", "VIDEO"]),
  storageUri: z.string().min(1),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AddEvidenceInput = z.infer<typeof addEvidenceSchema>;

export const resolveArbitrationSchema = z.object({
  verdict: z.enum(["RESOLVED_BUYER_WINS", "RESOLVED_SELLER_WINS", "RESOLVED_SPLIT"]),
});
export type ResolveArbitrationInput = z.infer<typeof resolveArbitrationSchema>;
