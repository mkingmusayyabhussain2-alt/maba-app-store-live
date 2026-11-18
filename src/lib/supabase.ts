/**
 * Supabase clients — server only.
 *
 * ALL database access in this app goes through the service-role client in
 * route handlers. Row Level Security is OFF (see the migration) because the
 * anon key is never used for writes and public reads go through
 * GET /api/apps, which runs server-side with the service client.
 *
 * Never import this file from a client component, and never expose
 * SUPABASE_SERVICE_ROLE_KEY to the browser (it has no NEXT_PUBLIC_ prefix,
 * so Next.js will not inline it).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}. See .env.example.`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return mustEnv('NEXT_PUBLIC_SUPABASE_URL');
}

/** Full-access server client. Bypasses RLS — only ever used in route handlers. */
export function getServiceClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), mustEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon client, for public reads if a route ever needs one. Not used for writes. */
export function getAnonClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Public (readable without auth) URL of a file in a public bucket. */
export function publicFileUrl(bucket: string, path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Extract the storage path from a public file URL for a given bucket,
 * e.g. ".../storage/v1/object/public/avatars/x/y.png" -> "x/y.png".
 * Returns null when the URL is not one of ours (external URLs are left alone).
 */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path ? decodeURIComponent(path) : null;
}
