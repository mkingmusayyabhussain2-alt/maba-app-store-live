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

/**
 * Password-login rate limit (migration 0004, `login_attempts` table).
 * Ek key (`user:<login>` ya `ip:<address>`) par 15 minute ke window mein
 * max 5 ghalat koshishen — phir wo key 15 minute ke liye lock ho jati hai.
 * Window khatam hote hi count dobara 0 se start hota hai. Successful login
 * par key ki row delete kar di jati hai.
 */
export const MAX_PASSWORD_ATTEMPTS = 5;
export const PASSWORD_LOCK_MINUTES = 15;

/** True when this key may still try a password login right now. */
export async function checkPasswordLoginAllowed(
  db: SupabaseClient,
  key: string,
): Promise<boolean> {
  const { data } = await db
    .from('login_attempts')
    .select('attempts, window_start')
    .eq('key', key)
    .maybeSingle();
  if (!data) return true;
  const row = data as { attempts: number; window_start: string };
  const windowStart = new Date(row.window_start).getTime();
  // Window khatam ho gaya to naya window — dobara try kar sakte hain.
  if (!Number.isFinite(windowStart)) return true;
  if (Date.now() - windowStart > PASSWORD_LOCK_MINUTES * 60_000) return true;
  return row.attempts < MAX_PASSWORD_ATTEMPTS;
}

/** Ek ghalat password koshish record karo (window khatam ho to naya window). */
export async function recordFailedPasswordLogin(
  db: SupabaseClient,
  key: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await db
    .from('login_attempts')
    .select('attempts, window_start')
    .eq('key', key)
    .maybeSingle();
  if (!data) {
    await db
      .from('login_attempts')
      .insert({ key, attempts: 1, window_start: now, updated_at: now });
    return;
  }
  const row = data as { attempts: number; window_start: string };
  const expired =
    Date.now() - new Date(row.window_start).getTime() >
    PASSWORD_LOCK_MINUTES * 60_000;
  await db
    .from('login_attempts')
    .update({
      attempts: expired ? 1 : row.attempts + 1,
      window_start: expired ? now : row.window_start,
      updated_at: now,
    })
    .eq('key', key);
}

/** Successful login (ya password reset) ke baad is key ki row saaf karo. */
export async function clearPasswordLoginAttempts(
  db: SupabaseClient,
  key: string,
): Promise<void> {
  await db.from('login_attempts').delete().eq('key', key);
}
