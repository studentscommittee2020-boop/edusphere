/**
 * Input Validation Utilities for Backend Services
 *
 * This module provides type-safe validation for user inputs to prevent
 * injection attacks, data corruption, and unexpected behavior.
 *
 * All user-facing functions should validate their inputs using these utilities.
 */

/**
 * Validates that a value is a non-empty string within length limits
 */
export function validateString(
  value: unknown,
  fieldName: string,
  minLength = 1,
  maxLength = 1000
): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.length < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters`);
  }
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
  return value.trim();
}

/**
 * Validates that a value is a valid UUID
 */
export function validateUUID(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string UUID`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new Error(`${fieldName} is not a valid UUID`);
  }
  return value;
}

/**
 * Validates that a value is a positive integer
 */
export function validatePositiveInt(
  value: unknown,
  fieldName: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

/**
 * Validates that a value is within an allowed set of options
 */
export function validateEnum<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T
): T[number] {
  if (!allowedValues.includes(value as T[number])) {
    throw new Error(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`
    );
  }
  return value as T[number];
}

/**
 * Validates email format (basic check)
 */
export function validateEmail(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new Error(`${fieldName} is not a valid email address`);
  }
  return value.toLowerCase();
}

/**
 * Validates phone number format (basic check - accepts various international formats)
 */
export function validatePhone(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  if (!phoneRegex.test(value)) {
    throw new Error(`${fieldName} is not a valid phone number`);
  }
  return value;
}

/**
 * Validates file size and type
 */
export function validateFile(
  file: File,
  fieldName: string,
  maxSizeMB = 10,
  allowedMimeTypes: string[] = []
): void {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(
      `${fieldName} exceeds ${maxSizeMB}MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`
    );
  }
  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.type)) {
    throw new Error(
      `${fieldName} must be one of: ${allowedMimeTypes.join(", ")}`
    );
  }
}

/**
 * Validates a date is not in the past
 */
export function validateFutureDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a date string`);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  if (date < new Date()) {
    throw new Error(`${fieldName} cannot be in the past`);
  }
  return value;
}

/**
 * Sanitizes input to prevent XSS
 */
export function sanitizeString(value: string): string {
  return value
    .replace(/[<>]/g, "") // Remove angle brackets
    .trim();
}

/**
 * Validates an array of strings (course codes, tags, etc.)
 */
export function validateStringArray(
  value: unknown,
  fieldName: string,
  minLength = 0,
  maxLength = 100
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  if (value.length < minLength || value.length > maxLength) {
    throw new Error(
      `${fieldName} must have between ${minLength} and ${maxLength} items`
    );
  }
  return value.map((item, idx) => {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${idx}] must be a string`);
    }
    return item.trim();
  });
}

/**
 * Validates that required fields are present in an object
 */
export function validateRequired<T extends Record<string, unknown>>(
  obj: T,
  requiredFields: (keyof T)[]
): void {
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      throw new Error(`${String(field)} is required`);
    }
  }
}
