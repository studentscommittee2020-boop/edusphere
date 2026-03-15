import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitizes user input for use in Supabase `.or()` filter strings.
 * Escapes SQL LIKE wildcards (%, _, \) AND PostgREST filter operators
 * (commas, periods, parentheses) that could inject additional filter clauses.
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\,().]/g, (ch) => `\\${ch}`);
}
