import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import {
  clearSessionCookie,
  clearVerifyCookie,
  getSessionEmail,
} from '@/lib/auth';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout-permanent { email }
 * PERMANENT logout: the email is burned forever.
 * Requires a session AND body.email === session email.
 * - Inserts into burned_emails, deletes all sessions for the email,
 *   marks the profile retired (row is KEPT so the email can never
 *   re-register — assertEmailUsable checks retired rows too),
 *   deletes open verification codes, clears both cookies.
 * Returns { ok: true, banned: true }.
 */
export async function POST(req: Request) {
  try {
    const sessionEmail = await getSessionEmail();
    if (!sessionEmail) return err('Login karen.', 401);

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || !isValidEmail(email)) {
      return err('Sahi email likhen.', 400);
    }
    if (email !== sessionEmail) {
      return err('Email aap ke account se match nahi karti.', 403);
    }

    const db = getServiceClient();
    const { error: burnError } = await db
      .from('burned_emails')
      .upsert({ email, reason: 'permanent logout' }, { onConflict: 'email' });
    if (burnError) throw burnError;

    await db.from('profiles').update({ retired_at: new Date().toISOString() }).eq('email', email);
    await db.from('sessions').delete().eq('email', email);
    await db.from('verification_codes').delete().eq('email', email);

    const res = NextResponse.json({ ok: true, banned: true });
    clearSessionCookie(res);
    clearVerifyCookie(res);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
