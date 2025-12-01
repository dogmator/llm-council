/**
 * Utility functions.
 */

/**
 * Safely parse JSON with error handling.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Truncate string to max length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Check if value is not null and not undefined.
 */
export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}


