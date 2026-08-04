/**
 * Centralized Error Handling for Backend Services
 *
 * Provides standardized error responses and error classification for
 * consistent API error handling across the application.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE";

export type HTTPStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;

/**
 * A class, not an interface — the helpers below narrow with `instanceof`,
 * which an interface cannot support at runtime.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly httpStatus: HTTPStatus;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: HTTPStatus = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/**
 * Classification helper: returns HTTP status based on error type
 */
export function getHttpStatus(error: unknown): HTTPStatus {
  if (error instanceof ApiError) {
    return error.httpStatus;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("not found") || msg.includes("no rows")) return 404;
    if (msg.includes("unauthorized") || msg.includes("auth")) return 401;
    if (msg.includes("forbidden") || msg.includes("permission")) return 403;
    if (msg.includes("conflict") || msg.includes("unique")) return 409;
    if (msg.includes("invalid") || msg.includes("validation")) return 422;
  }
  return 500;
}

/**
 * Extracts user-safe error message from database error
 */
export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    const msg = error.message;
    // Compare against a lowercased copy only. Real Postgres/PostgREST error
    // text is lowercase ("violates foreign key constraint", "violates
    // unique constraint", "violates check constraint"), so matching must be
    // case-insensitive — but `msg` (original case) is what we return, both
    // from the caller's own already-safe messages and on the fallback path,
    // so ordinary messages are never mangled into lowercase.
    const lowerMsg = msg.toLowerCase();
    // Hide sensitive database details from client
    if (lowerMsg.includes("foreign key constraint")) {
      return "This resource is referenced elsewhere and cannot be deleted";
    }
    if (lowerMsg.includes("unique constraint")) {
      return "This record already exists";
    }
    if (lowerMsg.includes("check constraint")) {
      return "Invalid data provided";
    }
    if (lowerMsg.includes("token")) {
      return "Authentication failed";
    }
    return msg;
  }
  return "An unexpected error occurred";
}

/**
 * Validation error helper
 */
export class ValidationError extends Error {
  constructor(public details: Record<string, string> = {}) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

/**
 * Not found error helper
 */
export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(
      id
        ? `${resource} with ID ${id} not found`
        : `${resource} not found`
    );
    this.name = "NotFoundError";
  }
}

/**
 * Unauthorized error helper (user not logged in)
 */
export class UnauthorizedError extends Error {
  constructor(message = "User is not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Forbidden error helper (user lacks permissions)
 */
export class ForbiddenError extends Error {
  constructor(message = "User does not have permission for this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Conflict error helper (duplicate resource)
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Converts thrown error to standardized response format
 */
export function formatErrorResponse(error: unknown): {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
} {
  let code: ErrorCode = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred";
  let details: unknown;

  if (error instanceof ValidationError) {
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    details = error.details;
  } else if (error instanceof NotFoundError) {
    code = "NOT_FOUND";
    message = error.message;
  } else if (error instanceof UnauthorizedError) {
    code = "UNAUTHORIZED";
    message = error.message;
  } else if (error instanceof ForbiddenError) {
    code = "FORBIDDEN";
    message = error.message;
  } else if (error instanceof ConflictError) {
    code = "CONFLICT";
    message = error.message;
  } else if (error instanceof Error) {
    message = getSafeErrorMessage(error);
    // Classify based on message content
    if (message.includes("Validation")) code = "VALIDATION_ERROR";
    else if (message.includes("not found")) code = "NOT_FOUND";
    else if (message.includes("permission")) code = "FORBIDDEN";
    else if (message.includes("Authentication")) code = "UNAUTHORIZED";
  } else if (typeof error === "string") {
    message = error;
  }

  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && details !== null ? { details } : {}),
    },
  };
}

/**
 * Success response formatter (for consistency)
 */
export function formatSuccessResponse<T>(data: T) {
  return {
    success: true,
    data,
  };
}

/**
 * Asserts that a condition is true, throws error if not
 */
export function assert(
  condition: boolean,
  errorClass: new (msg: string) => Error,
  message: string
): asserts condition {
  if (!condition) {
    throw new errorClass(message);
  }
}

/**
 * Null coalescing helper for database operations
 */
export function requireValue<T>(
  value: T | null | undefined,
  resource: string,
  id?: string
): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource, id);
  }
  return value;
}
