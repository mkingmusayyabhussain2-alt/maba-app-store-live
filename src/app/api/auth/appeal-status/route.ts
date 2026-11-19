import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { denyIfBanned, getProfileReview } from '@/lib/auth';
import type { Appeal } from '@/lib/types';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/appeal-status?email=
 * Ban notice page ke liye: ban ki details (muddat + wajah) aur is email
 * ki latest appeal (agar hai) — taake banned user dekh sake ke us ki
 * appeal review mein hai ya us par faisla ho gaya. Koi session nahi
 * chahiye (banned user ke paas session hota hi nahi); sirf is email ki
 * apni appeal dikhti hai, kisi aur ki nahi.
 * Returns { banned: { ban_until, review_note, banned_at } | null,
 *           appeal: Appeal | null }.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = normalizeEmail(searchParams.get('email') || '');
    if (!email || !isValidEmail(email)) {
      return err('Sahi email address likhen.', 400);
    }

    const review = await getProfileReview(email);
    let banned: {
      ban_until: string | null;
      review_note: string | null;
      banned_at: string | null;
    } | null = null;
    if (review?.status === 'banned') {
      // Muddat khatam ho to ban khud utar jata hai — phir banned null.
      const banMsg = await denyIfBanned(email);
      if (banMsg) {
        banned = {
          ban_until: review.ban_until,
          review_note: review.review_note,
          banned_at: review.banned_at,
        };
      }
    }

    const db = getServiceClient();
    const { data } = await db
      .from('appeals')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      banned,
      appeal: (data as Appeal | null) ?? null,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
