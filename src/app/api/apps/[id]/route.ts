import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { toPublicApp, type AppRow } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/apps/[id] — app detail. Only APPROVED apps are visible (404 otherwise). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const db = getServiceClient();
    const { data, error } = await db
      .from('apps')
      .select('*')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle();
    if (error) throw error;
    if (!data) return err('App nahi mili.', 404);
    return NextResponse.json({ app: toPublicApp(data as AppRow) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
