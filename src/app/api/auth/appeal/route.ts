import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { denyIfBanned, getProfileReview } from '@/lib/auth';
import type { Appeal } from '@/lib/types';
import { isValidEmail, normalizeEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_APPEALS_PER_DAY = 3;

/**
 * POST /api/auth/appeal { email, message }
 * Ban hue user ki appeal — store ki ban notice par "Appeal karo" form se
 * aati hai. Banned user ke paas session nahi hota, is liye pehchan email
 * se hoti hai (server khud check karta hai ke account waqai banned hai).
 * - Ek waqt mein sirf EK pending appeal: pehle wali review mein ho to 409.
 * - 24 ghante mein max 3 appeals (spam rokne ke liye).
 * - Ban ki muddat khatam ho gayi ho to appeal ki zaroorat nahi — ban khud
 *   utar jata hai, user dobara login kar sakta hai.
 * Returns { ok: true, appeal }.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      message?: unknown;
    } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!email || !isValidEmail(email)) {
      return err('Sahi email address likhen.', 400);
    }
    if (message.length < 10) {
      return err('Appeal mein kam se kam 10 characters likhen — batayen ke account kyun khulna chahiye.', 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return err(`Appeal ${MAX_MESSAGE_LENGTH} characters se zyada nahi ho sakti.`, 400);
    }

    const review = await getProfileReview(email);
    if (!review) return err('Account nahi mila.', 404);
    if (review.status !== 'banned') {
      return err('Aap ka account ban nahi hai — dobara login karo.', 400);
    }
    // Status 'banned' hai — muddat khatam ho to ban khud utar jata hai.
    const banMsg = await denyIfBanned(email);
    if (!banMsg) {
      return err('Aap ka ban khatam ho gaya hai — dobara login karo.', 400);
    }

    const db = getServiceClient();
    const { data: pending } = await db
      .from('appeals')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      return err('Aap ki appeal pehle se review mein hai. Faisla hote hi email aayegi.', 409);
    }
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count } = await db
      .from('appeals')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', oneDayAgo);
    if ((count ?? 0) >= MAX_APPEALS_PER_DAY) {
      return err('Aap ne bohat zyada appeal bhej di hain. Kal dobara try karo.', 429);
    }

    const { data, error } = await db
      .from('appeals')
      .insert({ email, message: message.slice(0, MAX_MESSAGE_LENGTH) })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, appeal: data as Appeal });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
