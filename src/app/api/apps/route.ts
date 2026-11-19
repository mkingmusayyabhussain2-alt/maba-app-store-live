import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { excludeBannedSubmitters } from '@/lib/auth';
import { toPublicApp, type AppRow } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/apps?search=&category=
 * Public store listing — only APPROVED apps, newest first (the "Nayi apps"
 * list). The UI sorts by downloads client-side for "Sab se zyada download".
 * Proof/submitter contact details are never included in public responses.
 * Apps whose submitter is ACTIVELY banned are hidden (unblocking brings
 * them back automatically; an expired ban is lifted when this runs).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const category = (searchParams.get('category') || '').trim().slice(0, 100);

    const db = getServiceClient();
    let q = db
      .from('apps')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100);

    if (category) q = q.eq('category', category);
    if (search) {
      // Strip PostgREST filter syntax characters so a search term can never
      // break out of the ilike pattern.
      const safe = search.replace(/[%\\,]/g, '');
      if (safe) {
        q = q.or(
          `name.ilike.%${safe}%,developer.ilike.%${safe}%,description.ilike.%${safe}%`,
        );
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    const visible = await excludeBannedSubmitters((data ?? []) as AppRow[]);
    const apps = visible.map(toPublicApp);
    return NextResponse.json({ apps });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
