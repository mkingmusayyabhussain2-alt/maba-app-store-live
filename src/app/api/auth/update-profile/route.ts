import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSessionEmail, isAccountApproved } from '@/lib/auth';
import { PURPOSES, type Profile, type Purpose } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST /api/auth/update-profile { name, place, purpose, language } — requires session. */
export async function POST(req: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    if (!(await isAccountApproved(email))) {
      return err('Aap ka account abhi review mein hai. Approve hone ke baad profile edit kar sakenge.', 403);
    }

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      place?: unknown;
      purpose?: unknown;
      language?: unknown;
    } | null;

    const updates: Record<string, string | null> = {};
    if (typeof body?.name === 'string') {
      const name = body.name.trim();
      if (!name) return err('Apna naam likhen.', 400);
      updates.name = name.slice(0, 100);
    }
    if (typeof body?.place === 'string') {
      updates.place = body.place.trim().slice(0, 100) || null;
    }
    if (typeof body?.purpose === 'string') {
      if (!PURPOSES.includes(body.purpose.trim() as Purpose)) {
        return err('Purpose theek nahi hai.', 400);
      }
      updates.purpose = body.purpose.trim();
    }
    if (typeof body?.language === 'string' && body.language.trim()) {
      updates.language = body.language.trim().slice(0, 50);
    }
    if (Object.keys(updates).length === 0) {
      return err('Kuch bhi update karne ke liye nahi hai.', 400);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('profiles')
      .update(updates)
      .eq('email', email)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, account: data as Profile });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
