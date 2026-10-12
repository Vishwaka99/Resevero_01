/**
 * Domain failures the BFF can turn into a message for the user. Anything else
 * that throws is a bug, and is reported as a generic failure.
 */
export type DomainErrorCode =
  | "not_found"
  | "forbidden"
  | "unauthenticated"
  | "invalid"
  | "conflict"
  | "rule_violation";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} was not found.`);
export const forbidden = (message = "You don't have permission to do that.") => new DomainError("forbidden", message);
export const unauthenticated = () => new DomainError("unauthenticated", "Sign in to continue.");
export const invalid = (message: string, details?: Record<string, unknown>) => new DomainError("invalid", message, details);
export const ruleViolation = (message: string, details?: Record<string, unknown>) => new DomainError("rule_violation", message, details);

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** HTTP status for a domain failure, used by the BFF route handlers. */
export function statusForCode(code: DomainErrorCode): number {
  switch (code) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "unauthenticated":
      return 401;
    case "conflict":
      return 409;
    case "invalid":
    case "rule_violation":
      return 422;
  }
}
