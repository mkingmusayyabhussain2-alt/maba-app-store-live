import { NextResponse } from 'next/server';
import { getServiceClient, publicFileUrl, storagePathFromPublicUrl } from '@/lib/supabase';
import { getSessionEmail, denyIfBanned, isAccountApproved } from '@/lib/auth';
import { toSafeProfile } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'photo';
}

/** POST /api/auth/photo — FormData field `photo` (image only). Requires session. */
export async function POST(req: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    const banMsg = await denyIfBanned(email);
    if (banMsg) return err(banMsg, 403);
    if (!(await isAccountApproved(email))) {
      return err('Aap ka account abhi review mein hai. Approve hone ke baad photo laga sakenge.', 403);
    }

    const form = await req.formData().catch(() => null);
    const photo = form?.get('photo');
    if (!photo || !(photo instanceof File) || photo.size === 0) {
      return err('Photo select karen.', 400);
    }
    if (!ALLOWED_IMAGE_TYPES.includes(photo.type)) {
      return err('Sirf PNG, JPG, WEBP ya GIF photo allowed hai.', 400);
    }

    const db = getServiceClient();
    const { data: profile } = await db
      .from('profiles')
      .select('avatar_url')
      .eq('email', email)
      .maybeSingle();
    const oldUrl = (profile as { avatar_url: string | null } | null)?.avatar_url ?? null;

    const ext = sanitizeFileName(photo.name).split('.').pop() || 'png';
    const path = `${email}/${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage
      .from('avatars')
      .upload(path, Buffer.from(await photo.arrayBuffer()), {
        contentType: photo.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const avatarUrl = publicFileUrl('avatars', path);
    const { data, error } = await db
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('email', email)
      .select('*')
      .single();
    if (error) {
      // Roll back the orphaned file if the profile update failed.
      await db.storage.from('avatars').remove([path]);
      throw error;
    }

    // Delete the previous avatar file, if any (best-effort).
    if (oldUrl) {
      const oldPath = storagePathFromPublicUrl(oldUrl, 'avatars');
      if (oldPath && oldPath !== path) {
        await db.storage.from('avatars').remove([oldPath]);
      }
    }

    return NextResponse.json({ ok: true, avatar_url: avatarUrl, account: toSafeProfile(data as Record<string, unknown> | null) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}

/** DELETE /api/auth/photo — removes the file and clears avatar_url. Requires session. */
export async function DELETE() {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    const photoBanMsg = await denyIfBanned(email);
    if (photoBanMsg) return err(photoBanMsg, 403);
    if (!(await isAccountApproved(email))) {
      return err('Aap ka account abhi review mein hai.', 403);
    }

    const db = getServiceClient();
    const { data: profile } = await db
      .from('profiles')
      .select('avatar_url')
      .eq('email', email)
      .maybeSingle();
    const oldUrl = (profile as { avatar_url: string | null } | null)?.avatar_url ?? null;

    if (oldUrl) {
      const oldPath = storagePathFromPublicUrl(oldUrl, 'avatars');
      if (oldPath) await db.storage.from('avatars').remove([oldPath]);
    }
    const { error } = await db
      .from('profiles')
      .update({ avatar_url: null })
      .eq('email', email);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
