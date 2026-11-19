import { NextResponse } from 'next/server';
import { getServiceClient, publicFileUrl } from '@/lib/supabase';
import { getSessionEmail, denyIfBanned, isAccountApproved } from '@/lib/auth';
import { isValidEmail } from '@/lib/types';
import { err, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
}

/**
 * POST /api/release — requires session. FormData:
 *   name, developer, version, category, description, proof_email, proof_phone,
 *   apk (required .apk file), icon (optional image).
 * Uploads the APK to the private `apks` bucket and the icon to the public
 * `icons` bucket, then inserts an `apps` row with status='pending'.
 * There is NO artificial size limit in code — but Supabase free tier storage
 * is 1 GB and Vercel serverless request limits apply, so very large APK
 * uploads may fail (see README.md). Returns { ok: true, id, status: 'pending' }.
 */
export async function POST(req: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return err('Login karen.', 401);
    const banMsg = await denyIfBanned(email);
    if (banMsg) return err(banMsg, 403);
    if (!(await isAccountApproved(email))) {
      return err('Aap ka account abhi review mein hai. Approve hone ke baad app release kar sakenge.', 403);
    }

    const form = await req.formData().catch(() => null);
    if (!form) return err('Form data nahi mili.', 400);

    const text = (key: string): string => {
      const v = form.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };
    const name = text('name');
    const developer = text('developer');
    const version = text('version');
    const category = text('category');
    const description = text('description');
    const proofEmail = text('proof_email');
    const proofPhone = text('proof_phone');

    if (!name) return err('App ka naam likhen.', 400);
    if (!proofEmail || !isValidEmail(proofEmail)) {
      return err('Sahi proof email likhen.', 400);
    }
    if (!proofPhone) return err('Proof phone number likhen.', 400);

    const apk = form.get('apk');
    if (!apk || !(apk instanceof File) || apk.size === 0) {
      return err('APK file select karen.', 400);
    }
    if (!apk.name.toLowerCase().endsWith('.apk')) {
      return err('Sirf .apk file upload karen.', 400);
    }

    const icon = form.get('icon');
    let iconFile: File | null = null;
    if (icon && icon instanceof File && icon.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.includes(icon.type)) {
        return err('Icon sirf PNG, JPG, WEBP ya GIF ho sakta hai.', 400);
      }
      iconFile = icon;
    }

    const db = getServiceClient();
    const stamp = Date.now();
    const apkPath = `${email}/${stamp}-${sanitizeFileName(apk.name)}`;
    const { error: apkError } = await db.storage
      .from('apks')
      .upload(apkPath, Buffer.from(await apk.arrayBuffer()), {
        contentType: 'application/vnd.android.package-archive',
        upsert: false,
      });
    if (apkError) {
      console.error('[release] APK upload failed:', apkError);
      return err('APK upload nahi ho saki. File size check karen aur dobara koshish karen.', 500);
    }

    let iconUrl: string | null = null;
    if (iconFile) {
      const iconExt = sanitizeFileName(iconFile.name).split('.').pop() || 'png';
      const iconPath = `${email}/${stamp}-icon.${iconExt}`;
      const { error: iconError } = await db.storage
        .from('icons')
        .upload(iconPath, Buffer.from(await iconFile.arrayBuffer()), {
          contentType: iconFile.type,
          upsert: false,
        });
      if (iconError) {
        console.error('[release] icon upload failed:', iconError);
        await db.storage.from('apks').remove([apkPath]);
        return err('Icon upload nahi ho saka. Dobara koshish karen.', 500);
      }
      iconUrl = publicFileUrl('icons', iconPath);
    }

    const { data, error } = await db
      .from('apps')
      .insert({
        name: name.slice(0, 100),
        developer: developer.slice(0, 100) || null,
        version: version.slice(0, 50) || null,
        category: category.slice(0, 100) || null,
        description: description.slice(0, 2000) || null,
        icon_url: iconUrl,
        apk_url: apkPath,
        apk_size: apk.size,
        status: 'pending',
        submitter_email: email,
        proof_email: proofEmail,
        proof_phone: proofPhone.slice(0, 30),
      })
      .select('id')
      .single();
    if (error) {
      await db.storage.from('apks').remove([apkPath]);
      if (iconUrl) {
        const iconPath = iconUrl.split('/icons/')[1];
        if (iconPath) await db.storage.from('icons').remove([decodeURIComponent(iconPath)]);
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      id: (data as { id: string }).id,
      status: 'pending',
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing environment variable')) {
      return err('Server ki setting mukammal nahi. Owner se rabta karen.', 500);
    }
    return serverError(e);
  }
}
