import { DomainError } from "@livestock/shared";

export class EscrowNotFoundError extends DomainError {
  constructor(escrowId: string) {
    super("ESCROW_NOT_FOUND", `Escrow transaction ${escrowId} not found`);
  }
}

export class DisputeNotFoundError extends DomainError {
  constructor(disputeId: string) {
    super("DISPUTE_NOT_FOUND", `Dispute ${disputeId} not found`);
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string, reasons: string[]) {
    super(
      "ILLEGAL_TRANSITION",
      `Transition ${from} -> ${to} is not allowed: ${reasons.join("; ")}`,
    );
  }
}

export class InspectionWindowClosedError extends DomainError {
  constructor() {
    super("INSPECTION_WINDOW_CLOSED", "The 24-hour inspection window has closed");
  }
}

export class DisputeAlreadyOpenError extends DomainError {
  constructor(escrowId: string) {
    super("DISPUTE_ALREADY_OPEN", `Escrow ${escrowId} already has an open dispute`);
  }
}

export class ConcurrentModificationError extends DomainError {
  constructor(entity: string, id: string) {
    super("CONCURRENT_MODIFICATION", `${entity} ${id} was modified concurrently; retry`);
  }
}

export class LedgerError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LEDGER_ERROR", message, { details });
  }
}

export class DuplicateIdempotencyError extends DomainError {
  constructor(key: string) {
    super("DUPLICATE_IDEMPOTENCY_KEY", `Idempotency key already used: ${key}`);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, { details });
  }
}
