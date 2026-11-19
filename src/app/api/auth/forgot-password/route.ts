import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendVerificationCode } from '@/lib/email';
import { denyIfBanned, getProfileReview } from '@/lib/auth';
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
 * POST /api/auth/forgot-password { email }
 * "Password bhool gaye" — email par 6-digit code bhejta hai, phir
 * /api/auth/reset-password se naya password set hota hai. Flow wahi hai
 * jo request-code ka hai (code hash ke saath store, 10 minute expiry,
 * 1 ghante mein max 5 codes).
 * - Account hi na ho to bhi `{ ok: true }` milta hai (lekin code nahi
 *   bheja jata) — taake koi ye guess na kar sake ke is email par account
 *   hai ya nahi. UI hamesha yahi dikhata hai: "Agar is email par account
 *   hai to code bhej diya gaya hai."
 * - Burned/rejected email par 403, ACTIVELY banned email par 403 (ban ki
 *   muddat + wajah) — banned user code se password reset nahi kar sakta.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || !isValidEmail(email)) {
      return err('Sahi email address likhen.', 400);
    }

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
    const banMsg = await denyIfBanned(email);
    if (banMsg) return err(banMsg, 403);

    // Account nahi hai to code bheje baghair hi ok — existence leak nahi.
    if (!review) return NextResponse.json({ ok: true });

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
      await db.from('verification_codes').delete().eq('id', (inserted as { id: string }).id);
      console.error('[forgot-password] email send failed:', e);
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
