/**
 * Sessions + verification tokens + the "one email, one account, ever" rule.
 *
 * Cookies:
 * - `maba_session` — httpOnly, Secure in production, SameSite=Lax, 30 days.
 *   Value is a random token; only its SHA-256 hash is stored in `sessions`.
 * - `maba_verify` — httpOnly, Secure in production, SameSite=Lax, 15 minutes.
 *   Value is `email.exp.hmac` where hmac = HMAC-SHA256(SESSION_SECRET,
 *   "email.exp"). No server row needed; the HMAC proves it was issued here.
 *
 * Permanent rule: an email that is in `burned_emails` OR has ANY row in
 * `profiles` (active or retired) can never register again. `assertEmailUsable`
 * enforces this at complete-profile time for brand-new registrations.
 * `request-code` has its own check: burned and rejected emails get no code,
 * but pending/approved accounts may request one (returning login).
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getServiceClient } from './supabase';
import type { AccountStatus, AppRow } from './types';

export const SESSION_COOKIE = 'maba_session';
export const VERIFY_COOKIE = 'maba_verify';
export const SESSION_TTL_DAYS = 30;
export const VERIFY_TTL_MINUTES = 15;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing environment variable: SESSION_SECRET. See .env.example.');
  }
  return secret;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Create a session row + return the raw token to set as a cookie. */
export async function createSession(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const db = getServiceClient();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000).toISOString();
  const { error } = await db
    .from('sessions')
    .insert({ email, token_hash: sha256(token), expires_at: expiresAt });
  if (error) throw error;
  return token;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60));
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
}

export function clearVerifyCookie(res: NextResponse): void {
  res.cookies.set(VERIFY_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
}

/** Sign a short-lived "this email just verified its code" cookie value. */
export function createVerifyToken(email: string): string {
  const exp = Math.floor(Date.now() / 1000) + VERIFY_TTL_MINUTES * 60;
  const payload = `${email}.${exp}`;
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function setVerifyCookie(res: NextResponse, email: string): void {
  res.cookies.set(VERIFY_COOKIE, createVerifyToken(email), cookieOptions(VERIFY_TTL_MINUTES * 60));
}

/** Read the session cookie, validate it against the sessions table. */
export async function getSessionEmail(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getServiceClient();
  const { data, error } = await db
    .from('sessions')
    .select('email, expires_at')
    .eq('token_hash', sha256(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return (data as { email: string }).email;
}

/** Verify the maba_verify cookie and return the email it was issued for. */
export async function getVerifiedEmail(): Promise<string | null> {
  const value = (await cookies()).get(VERIFY_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length < 3) return null;
  const sig = parts.pop() as string;
  const expStr = parts.pop() as string;
  const email = parts.join('.');
  const exp = Number(expStr);
  if (!email || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = createHmac('sha256', sessionSecret())
    .update(`${email}.${exp}`)
    .digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return email;
}

/**
 * The one-email-one-account rule. Returns a Roman Urdu error message when the
 * email can never be used again, or null when it is usable.
 * Blocks: burned emails (permanent logout) AND any existing profile row,
 * including retired ones (logout keeps the row precisely so re-registering
 * stays impossible).
 */
export async function assertEmailUsable(email: string): Promise<string | null> {
  const db = getServiceClient();
  const { data: burned } = await db
    .from('burned_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (burned) {
    return 'Is email par dobara account nahi ban sakta.';
  }
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profile) {
    return 'Is email par dobara account nahi ban sakta.';
  }
  return null;
}

export interface ProfileReview {
  id: string;
  status: AccountStatus;
  retired_at: string | null;
  /** Ban (migration 0003): kab ban hua + kab tak (null = permanent ban). */
  banned_at: string | null;
  ban_until: string | null;
  /** Ban/reject ki wajah (review_note column reuse hota hai). */
  review_note: string | null;
}

/** Fetch an email's profile review state (null when no profile exists). */
export async function getProfileReview(email: string): Promise<ProfileReview | null> {
  const db = getServiceClient();
  const { data } = await db
    .from('profiles')
    .select('id, status, retired_at, banned_at, ban_until, review_note')
    .eq('email', email)
    .maybeSingle();
  return (data as ProfileReview | null) ?? null;
}

/**
 * True when a timed ban has run out. ban_until null means a PERMANENT ban —
 * it never expires on its own.
 */
export function isBanExpired(banUntil: string | null | undefined): boolean {
  if (!banUntil) return false;
  const t = new Date(banUntil).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

/** The DB update that lifts an expired ban (back to 'approved', ban fields cleared). */
function liftBanUpdate() {
  return {
    status: 'approved' as const,
    banned_at: null,
    ban_until: null,
    reviewed_at: new Date().toISOString(),
  };
}

/**
 * Lift ONE account's expired ban. Returns true when a row was actually
 * lifted. Permanent bans (ban_until null) are never lifted here.
 */
export async function liftExpiredBan(email: string): Promise<boolean> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('profiles')
    .update(liftBanUpdate())
    .eq('email', email)
    .eq('status', 'banned')
    .not('ban_until', 'is', null)
    .lte('ban_until', new Date().toISOString())
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Lift EVERY expired ban in one query (used by public listings). */
export async function liftExpiredBans(): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from('profiles')
    .update(liftBanUpdate())
    .eq('status', 'banned')
    .not('ban_until', 'is', null)
    .lte('ban_until', new Date().toISOString());
  if (error) throw error;
}

/** Roman Urdu message for an ACTIVE ban — until date or permanent + note. */
export function banMessage(review: {
  ban_until: string | null;
  review_note: string | null;
}): string {
  const base = review.ban_until
    ? `Aap ka account ${formatBanUntil(review.ban_until)} tak ban hai.`
    : 'Aap ka account permanently ban hai.';
  const note = review.review_note ? ` Wajah: ${review.review_note}` : '';
  return `${base}${note} Owner se rabta karen.`;
}

/** "12 Nov 2026, 09:30" jaisi readable date — ban ki muddat dikhane ke liye. */
export function formatBanUntil(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The ban message when this email is ACTIVELY banned, or null when it is
 * not banned — or its ban just expired (the ban is lifted lazily, so the
 * account works again without any owner action).
 * Routes use this to give a banned user a clear 403 instead of the generic
 * "review mein hai" message.
 */
export async function denyIfBanned(email: string): Promise<string | null> {
  const review = await getProfileReview(email);
  if (!review || review.status !== 'banned') return null;
  if (isBanExpired(review.ban_until)) {
    await liftExpiredBan(email);
    return null;
  }
  return banMessage(review);
}

/** True when this email's apps must stay hidden from the public store. */
export async function isSubmitterActivelyBanned(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  return (await denyIfBanned(email)) !== null;
}

/**
 * Drop every app whose submitter is ACTIVELY banned (expired bans are
 * lifted first, so an unblocked user's apps come back automatically).
 * Used by the public store listing — detail/download routes check the
 * single submitter with isSubmitterActivelyBanned instead.
 */
export async function excludeBannedSubmitters(apps: AppRow[]): Promise<AppRow[]> {
  const emails = [
    ...new Set(
      apps
        .map((a) => a.submitter_email)
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  if (emails.length === 0) return apps;
  await liftExpiredBans();
  const db = getServiceClient();
  const { data, error } = await db
    .from('profiles')
    .select('email')
    .in('email', emails)
    .eq('status', 'banned');
  if (error) throw error;
  const banned = new Set(((data ?? []) as { email: string }[]).map((r) => r.email));
  if (banned.size === 0) return apps;
  return apps.filter((a) => !a.submitter_email || !banned.has(a.submitter_email));
}

/**
 * True when this email may use the store: the owner is always approved, and
 * any other email needs a profile with status 'approved'. Pending, rejected
 * and ACTIVELY banned accounts get no session and no authed actions — even
 * if an old session cookie is still lying around (e.g. approved phir reject
 * ya ban ho gaya). An EXPIRED ban is lifted lazily here, so the account is
 * approved again without the owner doing anything.
 */
export async function isAccountApproved(email: string): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  const review = await getProfileReview(email);
  if (!review) return false;
  if (review.status === 'banned') {
    if (isBanExpired(review.ban_until)) {
      await liftExpiredBan(email);
      return true;
    }
    return false;
  }
  return review.status === 'approved';
}

/** True when the session email is the store owner (from OWNER_EMAIL env). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return Boolean(email && owner && email.trim().toLowerCase() === owner);
}
