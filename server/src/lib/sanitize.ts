/**
 * Strip HTML tags and dangerous characters from string inputs.
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // strip angle brackets
    .replace(/javascript:/gi, '') // strip JS protocol
    .replace(/on\w+=/gi, '') // strip event handlers
    .trim();
}

/**
 * Sanitize all string values in an object (shallow).
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(result[key] as string);
    }
  }
  return result;
}
