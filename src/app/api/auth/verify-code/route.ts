import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { setVerifyCookie } from '@/lib/auth';
import { hashCode, MAX_CODE_ATTEMPTS } from '@/lib/rate';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/verify-code { email, code }
 * Wrong code -> attempts++ and 400. After 5 wrong attempts the code is
 * locked and a new one must be requested. Correct code -> code rows deleted,
 * `maba_verify` cookie set (15 min), { ok: true }.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      code?: unknown;
    } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!email || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return err('Sahi email aur 6-digit code likhen.', 400);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('verification_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('email', email)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return err('Code ghalat ya khatam ho gaya hai. Naya code mangwayen.', 400);
    }
    const row = data as { id: string; code_hash: string; attempts: number; expires_at: string };
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      return err('Is code ki koshishen khatam ho gayin. Naya code mangwayen.', 400);
    }

    const expected = Buffer.from(row.code_hash, 'utf8');
    const actual = Buffer.from(hashCode(code), 'utf8');
    const match =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!match) {
      await db
        .from('verification_codes')
        .update({ attempts: row.attempts + 1 })
        .eq('id', row.id);
      return err('Code ghalat hai. Dobara likhen.', 400);
    }

    await db.from('verification_codes').delete().eq('email', email);

    const res = NextResponse.json({ ok: true });
    setVerifyCookie(res, email);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
