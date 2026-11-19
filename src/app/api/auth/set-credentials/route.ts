import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import {
  denyIfBanned,
  getSessionEmail,
  hashPassword,
  isAccountApproved,
} from '@/lib/auth';
import { clearPasswordLoginAttempts } from '@/lib/rate';
import { isValidUsername, normalizeUsername } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/set-credentials { username, password } — session required.
 * Profile banne ke baad ka step: user apna username + password set karta
 * hai, phir dobara Gmail code ke baghair username/email + password se
 * login kar sakta hai.
 * - Username: 3-20 chars, letters/numbers/underscore, unique
 *   (case-insensitive). Ek dafa set ho jaye to badla nahi ja sakta —
 *   password badalne ke liye "Password bhool gaye" (forgot-password) hai.
 * - Password: kam se kam 6 characters. Sirf bcrypt hash store hota hai.
 * - Password ko session rehte hue dobara bhi set kiya ja sakta hai (change).
 * Returns { ok: true, username } — hash kabhi response mein nahi aata.
 */
export async function POST(req: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    const banMsg = await denyIfBanned(email);
    if (banMsg) return err(banMsg, 403);
    if (!(await isAccountApproved(email))) {
      return err('Aap ka account abhi review mein hai. Approve hone ke baad username/password set kar sakenge.', 403);
    }

    const body = (await req.json().catch(() => null)) as {
      username?: unknown;
      password?: unknown;
    } | null;
    const rawUsername = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!rawUsername || !isValidUsername(rawUsername)) {
      return err('Username 3-20 characters ka ho — sirf letters, numbers aur underscore.', 400);
    }
    if (password.length < 6 || password.length > 128) {
      return err('Password kam se kam 6 characters ka ho.', 400);
    }
    const username = normalizeUsername(rawUsername);

    const db = getServiceClient();
    const { data: existing } = await db
      .from('profiles')
      .select('username')
      .eq('email', email)
      .maybeSingle();
    if (!existing) return err('Account nahi mila.', 404);
    const currentUsername = (existing as { username: string | null }).username;
    if (currentUsername && currentUsername !== username) {
      return err('Username pehle se set hai — badla nahi ja sakta.', 400);
    }
    if (!currentUsername) {
      // Username unique hona chahiye (case-insensitive).
      const { data: taken } = await db
        .from('profiles')
        .select('email')
        .eq('username', username)
        .neq('email', email)
        .maybeSingle();
      if (taken) {
        return err('Ye username pehle se liya gaya hai. Koi aur chuno.', 409);
      }
    }

    const passwordHash = await hashPassword(password);
    const { error } = await db
      .from('profiles')
      .update({ username, password_hash: passwordHash })
      .eq('email', email);
    if (error) {
      // Race: do users ne ek hi waqt par ek hi username liya.
      if ((error as { code?: string }).code === '23505') {
        return err('Ye username pehle se liya gaya hai. Koi aur chuno.', 409);
      }
      throw error;
    }

    // Naya password set hote hi purani lock khatam — user foran login kar sake.
    await clearPasswordLoginAttempts(db, `user:${username}`);
    await clearPasswordLoginAttempts(db, `user:${email}`);
    return NextResponse.json({ ok: true, username });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
