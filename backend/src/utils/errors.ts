/**
 * Custom error classes for better error handling
 */

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string, code?: string) {
    super(400, message, code);
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string, code?: string) {
    super(409, message, code);
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends ApiError {
  constructor(message: string = "Internal server error") {
    super(500, message, "INTERNAL_ERROR");
  }
}

/**
 * Database error wrapper
 */
export class DatabaseError extends ApiError {
  constructor(message: string, originalError?: Error) {
    super(500, message, "DATABASE_ERROR");
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}
