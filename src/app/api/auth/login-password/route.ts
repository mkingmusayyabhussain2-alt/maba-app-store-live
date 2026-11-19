import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import {
  denyIfBanned,
  getClientIp,
  getProfileByLogin,
  createSession,
  setSessionCookie,
  verifyPassword,
} from '@/lib/auth';
import {
  checkPasswordLoginAllowed,
  clearPasswordLoginAttempts,
  recordFailedPasswordLogin,
  PASSWORD_LOCK_MINUTES,
} from '@/lib/rate';
import { toSafeProfile } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const WRONG_CREDENTIALS = 'Username/email ya password ghalat hai.';

/**
 * POST /api/auth/login-password { login, password }
 * Username (ya email) + password se login — dobara Gmail code ki zaroorat
 * nahi. Session wahi `maba_session` cookie hoti hai jo code-login deta
 * hai (30 din).
 * - Ghalat credentials par hamesha ek jaisa generic 401 — ye nahi bataya
 *   jata ke username ghalat tha ya password, taake account guess na ho.
 * - Rate limit: ek login (user) ya ek IP par 15 minute mein max 5 ghalat
 *   koshishen — phir 429 "thori der baad try karo". Successful login par
 *   user key ki lock saaf ho jati hai.
 * - Banned account par 403 — ban ki muddat + wajah ke saath, aur
 *   `banned: true` taake UI ban notice + appeal form dikha sake. Ban ki
 *   muddat khatam ho gayi ho to ban khud utar jata hai aur login chal
 *   padta hai. Pending/rejected account par bhi 403 (session nahi).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      login?: unknown;
      password?: unknown;
    } | null;
    const login = typeof body?.login === 'string' ? body.login.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!login || login.length > 100 || !password) {
      return err(WRONG_CREDENTIALS, 401);
    }

    const db = getServiceClient();
    const userKey = `user:${login.toLowerCase()}`;
    const ipKey = `ip:${getClientIp(req)}`;
    const [userAllowed, ipAllowed] = await Promise.all([
      checkPasswordLoginAllowed(db, userKey),
      checkPasswordLoginAllowed(db, ipKey),
    ]);
    if (!userAllowed || !ipAllowed) {
      return err(
        `Bohat zyada ghalat koshishen ho gayin. ${PASSWORD_LOCK_MINUTES} minute baad dobara try karo.`,
        429,
      );
    }

    const recordFailure = async () => {
      await Promise.all([
        recordFailedPasswordLogin(db, userKey),
        recordFailedPasswordLogin(db, ipKey),
      ]);
    };

    const profile = await getProfileByLogin(login);
    if (!profile || !profile.password_hash || profile.retired_at) {
      // Account hi nahi, ya password set hi nahi — generic jawab, koi leak nahi.
      await recordFailure();
      return err(WRONG_CREDENTIALS, 401);
    }

    if (profile.status === 'banned') {
      const banMsg = await denyIfBanned(profile.email);
      if (banMsg) {
        // Ban abhi active hai — session nahi, ban notice + appeal ka jawab.
        return NextResponse.json(
          {
            error: banMsg,
            banned: true,
            ban_until: profile.ban_until,
            review_note: profile.review_note,
            email: profile.email,
          },
          { status: 403 },
        );
      }
      // Ban ki muddat khatam — denyIfBanned ne utaar diya, login jaari hai.
    }
    if (profile.status === 'rejected') {
      return err('Aap ka account reject kar diya gaya hai. Dobara account nahi ban sakta.', 403);
    }
    if (profile.status === 'pending') {
      return err('Aap ka account abhi review mein hai. Approve hone ke baad login kar sakenge.', 403);
    }

    const match = await verifyPassword(password, profile.password_hash);
    if (!match) {
      await recordFailure();
      return err(WRONG_CREDENTIALS, 401);
    }

    await clearPasswordLoginAttempts(db, userKey);
    const token = await createSession(profile.email);
    const { data } = await db
      .from('profiles')
      .select('*')
      .eq('email', profile.email)
      .maybeSingle();
    const res = NextResponse.json({
      ok: true,
      account: toSafeProfile(data as Record<string, unknown> | null),
    });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
