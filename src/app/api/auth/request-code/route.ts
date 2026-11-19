import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendVerificationCode } from '@/lib/email';
import { getProfileReview } from '@/lib/auth';
import {
  codeExpiresAt,
  countRecentCodes,
  deleteExpiredCodes,
  generateCode,
  hashCode,
  MAX_CODES_PER_HOUR,
} from '@/lib/rate';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/request-code { email }
 * Sends a 6-digit verification code by email. Returns { ok: true } only —
 * the code is NEVER in any API response.
 * - 403 when the email is burned or its account was rejected by the owner.
 * - Existing pending/approved profiles may also request a code: that is how
 *   a returning user logs in (or checks a pending account's status).
 * - 429 after 5 codes per email per hour.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || !isValidEmail(email)) {
      return err('Sahi email address likhen.', 400);
    }

    // Burned emails can never come back. Rejected accounts get no new code.
    // Pending and approved accounts MAY request a code — that is how a
    // returning user logs in (or checks a pending account's status).
    const db = getServiceClient();
    const { data: burned } = await db
      .from('burned_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (burned) {
      return err('Is email par dobara account nahi ban sakta.', 403);
    }
    const review = await getProfileReview(email);
    if (review?.status === 'rejected') {
      return err('Aap ka account reject kar diya gaya hai. Dobara account nahi ban sakta.', 403);
    }

    await deleteExpiredCodes(db, email);
    const recent = await countRecentCodes(db, email);
    if (recent >= MAX_CODES_PER_HOUR) {
      return err('Bohat zyada koshishen ho gayin. 1 ghante baad dobara koshish karen.', 429);
    }

    const code = generateCode();
    const { data: inserted, error: insertError } = await db
      .from('verification_codes')
      .insert({
        email,
        code_hash: hashCode(code),
        expires_at: codeExpiresAt().toISOString(),
      })
      .select('id')
      .single();
    if (insertError || !inserted) throw insertError ?? new Error('Code insert failed');

    try {
      await sendVerificationCode(email, code);
    } catch (e) {
      // Do not leave an unusable code behind if the email could not be sent.
      await db.from('verification_codes').delete().eq('id', (inserted as { id: string }).id);
      console.error('[request-code] email send failed:', e);
      return err('Email bhejne mein masla aa gaya. Thodi der baad dobara koshish karen.', 500);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
