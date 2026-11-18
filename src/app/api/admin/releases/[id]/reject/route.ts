import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSessionEmail, isOwnerEmail } from '@/lib/auth';
import type { AppRow } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/releases/[id]/reject { note? } — owner only.
 * Sets status='rejected' and stores the optional note in rejection_note.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    if (!isOwnerEmail(email)) {
      return err('Ye page sirf owner ke liye hai.', 403);
    }

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null;

    const db = getServiceClient();
    const { data, error } = await db
      .from('apps')
      .update({ status: 'rejected', rejection_note: note })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return err('Release nahi mili.', 404);
    return NextResponse.json({ ok: true, app: data as AppRow });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
