import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSessionEmail } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me[?email=]
 * Session cookie -> { account, bannedEmail }. `account` is null when there is
 * no session or no profile yet.
 * Optional ?email= lets the UI check the burned status for the logout screen:
 * bannedEmail is the email only when it is in `burned_emails`, otherwise null.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const checkEmailRaw = searchParams.get('email') || '';
    const checkEmail = checkEmailRaw ? normalizeEmail(checkEmailRaw) : '';

    let bannedEmail: string | null = null;
    if (checkEmail && isValidEmail(checkEmail)) {
      const db = getServiceClient();
      const { data } = await db
        .from('burned_emails')
        .select('email')
        .eq('email', checkEmail)
        .maybeSingle();
      if (data) bannedEmail = checkEmail;
    }

    const sessionEmail = await getSessionEmail();
    if (!sessionEmail) {
      return NextResponse.json({ account: null, bannedEmail });
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('email', sessionEmail)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ account: (data as Profile | null) ?? null, bannedEmail });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
