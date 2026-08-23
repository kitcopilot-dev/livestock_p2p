/**
 * Base class for all domain errors. `code` is a stable machine-readable
 * identifier; `retryable` distinguishes transient failures (network, timeouts)
 * from permanent ones (illegal transition, validation).
 */
export class DomainError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}
