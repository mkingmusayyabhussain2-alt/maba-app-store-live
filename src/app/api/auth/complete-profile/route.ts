import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import {
  assertEmailUsable,
  clearVerifyCookie,
  createSession,
  getVerifiedEmail,
  setSessionCookie,
} from '@/lib/auth';
import { PURPOSES, type Profile, type Purpose } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/complete-profile { name, place, purpose, language }
 * Requires the `maba_verify` cookie (email just proved by code). Re-checks
 * the one-email-one-account rule, inserts the profile, creates a session,
 * clears the verify cookie. Returns { ok: true, account }.
 */
export async function POST(req: Request) {
  try {
    const email = await getVerifiedEmail();
    if (!email) {
      return err('Pehle email verify karen. Code dobara mangwayen.', 401);
    }

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      place?: unknown;
      purpose?: unknown;
      language?: unknown;
    } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const place = typeof body?.place === 'string' ? body.place.trim() : '';
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : '';
    const language =
      typeof body?.language === 'string' && body.language.trim()
        ? body.language.trim().slice(0, 50)
        : 'Roman Urdu';

    if (!name) return err('Apna naam likhen.', 400);
    if (!PURPOSES.includes(purpose as Purpose)) {
      return err('Purpose theek nahi hai.', 400);
    }

    const unusable = await assertEmailUsable(email);
    if (unusable) return err(unusable, 403);

    const db = getServiceClient();
    const { data, error } = await db
      .from('profiles')
      .insert({
        email,
        name: name.slice(0, 100),
        place: place.slice(0, 100) || null,
        purpose,
        language,
      })
      .select('*')
      .single();
    if (error) {
      // Race: a profile appeared between the check and the insert.
      if ((error as { code?: string }).code === '23505') {
        return err('Is email par dobara account nahi ban sakta.', 403);
      }
      throw error;
    }

    const token = await createSession(email);
    const res = NextResponse.json({ ok: true, account: data as Profile });
    setSessionCookie(res, token);
    clearVerifyCookie(res);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
