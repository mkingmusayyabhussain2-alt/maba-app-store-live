import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import {
  assertEmailUsable,
  clearVerifyCookie,
  createSession,
  getProfileReview,
  getVerifiedEmail,
  isOwnerEmail,
  setSessionCookie,
} from '@/lib/auth';
import { PURPOSES, type Profile, type Purpose } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/complete-profile { name, place, purpose, language }
 * Requires the `maba_verify` cookie (email just proved by code).
 *
 * Account review (migration 0002):
 * - NEW email: profile is created with status 'pending' — NO session — and
 *   the UI shows "account review mein hai, 1 din mein approve hoga". The
 *   owner email is created 'approved' and gets a session as before.
 * - RETURNING email with an 'approved' profile: a session is issued, so an
 *   approved user can log back in with a fresh code.
 * - RETURNING email with a 'pending' profile: { ok: true, status: 'pending' }
 *   with NO session — the UI shows the pending notice again.
 * - RETURNING email with a 'rejected' profile: 403.
 * Returns { ok: true, status, account }.
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

    const db = getServiceClient();
    const owner = isOwnerEmail(email);

    // ---- Returning user: profile already exists ----
    const existing = await getProfileReview(email);
    if (existing) {
      if (existing.retired_at) {
        return err('Is email par dobara account nahi ban sakta.', 403);
      }
      if (existing.status === 'rejected' && !owner) {
        return err('Aap ka account reject kar diya gaya hai. Dobara account nahi ban sakta.', 403);
      }
      if (existing.status === 'pending' && !owner) {
        // Still waiting for review — no session yet.
        const { data: account } = await db
          .from('profiles')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        const res = NextResponse.json({
          ok: true,
          status: 'pending',
          account: (account as Profile | null) ?? null,
        });
        clearVerifyCookie(res);
        return res;
      }
      // Approved (or owner): log back in with a fresh session.
      const { data: account } = await db
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      const token = await createSession(email);
      const res = NextResponse.json({
        ok: true,
        status: 'approved',
        account: (account as Profile | null) ?? null,
      });
      setSessionCookie(res, token);
      clearVerifyCookie(res);
      return res;
    }

    // ---- New user: create the profile ----
    const unusable = await assertEmailUsable(email);
    if (unusable) return err(unusable, 403);

    const { data, error } = await db
      .from('profiles')
      .insert({
        email,
        name: name.slice(0, 100),
        place: place.slice(0, 100) || null,
        purpose,
        language,
        status: owner ? 'approved' : 'pending',
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

    if (!owner) {
      // New account goes to review — no session until the owner approves.
      const res = NextResponse.json({
        ok: true,
        status: 'pending',
        account: data as Profile,
      });
      clearVerifyCookie(res);
      return res;
    }

    const token = await createSession(email);
    const res = NextResponse.json({
      ok: true,
      status: 'approved',
      account: data as Profile,
    });
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
