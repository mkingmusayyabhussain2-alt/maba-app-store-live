/**
 * Verification-code rules (single source of truth, used by the auth routes).
 *
 * - 6-digit numeric code, stored only as a SHA-256 hash — never plaintext.
 * - Code expires after 10 minutes.
 * - Max 5 codes per email per hour (counted from verification_codes rows).
 * - A code is locked after 5 wrong attempts; the user must request a new one.
 */
import { createHash, randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CODE_TTL_MINUTES = 10;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_CODE_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function codeExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + CODE_TTL_MINUTES * 60_000);
}

/** How many codes were created for this email in the last hour. */
export async function countRecentCodes(db: SupabaseClient, email: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count, error } = await db
    .from('verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', oneHourAgo);
  if (error) throw error;
  return count ?? 0;
}

/** Delete expired codes for an email (housekeeping on each new request). */
export async function deleteExpiredCodes(db: SupabaseClient, email: string): Promise<void> {
  await db
    .from('verification_codes')
    .delete()
    .eq('email', email)
    .lt('expires_at', new Date().toISOString());
}
