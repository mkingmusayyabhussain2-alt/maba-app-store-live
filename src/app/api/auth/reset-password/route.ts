import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { denyIfBanned, getProfileByLogin, hashPassword } from '@/lib/auth';
import { clearPasswordLoginAttempts, hashCode, MAX_CODE_ATTEMPTS } from '@/lib/rate';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset-password { email, code, new_password }
 * Forgot-password ka step 2: email par aaya 6-digit code verify karta hai
 * (wahi rules jo verify-code ke hain — 5 ghalat koshishon par code lock),
 * phir naya password bcrypt hash ke saath save karta hai. Code verify
 * hote hi saare code rows delete ho jate hain aur login ki purani lock
 * saaf ho jati hai — user foran naye password se login kar sakta hai.
 * Banned account par 403 (ban ki muddat + wajah); khatam hua ban khud
 * utar jata hai. Username pehle se set na ho to bhi password set ho
 * jata hai — login phir email + password se hota hai.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      code?: unknown;
      new_password?: unknown;
    } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';
    if (!email || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return err('Sahi email aur 6-digit code likhen.', 400);
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return err('Naya password kam se kam 6 characters ka ho.', 400);
    }

    const banMsg = await denyIfBanned(email);
    if (banMsg) return err(banMsg, 403);

    const profile = await getProfileByLogin(email);
    if (!profile || profile.retired_at) {
      return err('Code ghalat ya khatam ho gaya hai. Naya code mangwayen.', 400);
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
    const passwordHash = await hashPassword(newPassword);
    const { error: updateError } = await db
      .from('profiles')
      .update({ password_hash: passwordHash })
      .eq('email', email);
    if (updateError) throw updateError;

    await Promise.all([
      clearPasswordLoginAttempts(db, `user:${email}`),
      ...(profile.username
        ? [clearPasswordLoginAttempts(db, `user:${profile.username}`)]
        : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
