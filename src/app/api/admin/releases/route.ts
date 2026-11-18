import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSessionEmail, isOwnerEmail } from '@/lib/auth';
import type { AppRow } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/releases — owner only (session email === OWNER_EMAIL).
 * Returns ALL releases (pending / approved / rejected), newest first.
 * Includes proof contact details — this route is owner-only, never public.
 */
export async function GET() {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    if (!isOwnerEmail(email)) {
      return err('Ye page sirf owner ke liye hai.', 403);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('apps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ releases: (data ?? []) as AppRow[] });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
