import { NextResponse } from 'next/server';
import { getServiceClient, getSupabaseUrl } from '@/lib/supabase';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

/**
 * GET /api/apps/[id]/download — only APPROVED apps.
 * Increments the download counter, then 302-redirects to the APK in
 * Supabase Storage (a 1-hour signed URL, since the `apks` bucket is private).
 * If apk_url is already a full URL, it is used directly.
 */
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

    const app = data as { apk_url: string | null; downloads: number | null };
    if (!app.apk_url) return err('Is app ki APK file maujood nahi.', 404);

    // Count the download (best-effort: a counter failure must not block the file).
    try {
      await db
        .from('apps')
        .update({ downloads: (app.downloads ?? 0) + 1 })
        .eq('id', id);
    } catch (e) {
      console.error('[download] counter update failed:', e);
    }

    if (/^https?:\/\//i.test(app.apk_url)) {
      return NextResponse.redirect(app.apk_url, 302);
    }

    const { data: signed, error: signError } = await db.storage
      .from('apks')
      .createSignedUrl(app.apk_url, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      console.error('[download] signed URL failed:', signError);
      // Last resort: try the public URL form (works if the bucket was made public).
      return NextResponse.redirect(
        `${getSupabaseUrl()}/storage/v1/object/public/apks/${app.apk_url}`,
        302,
      );
    }
    return NextResponse.redirect(signed.signedUrl, 302);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
