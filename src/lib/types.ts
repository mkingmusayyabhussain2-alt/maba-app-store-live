/**
 * Shared row types for the MABA App Store backend.
 * These mirror the tables created in supabase/migrations/0001_init.sql.
 * Keep them in sync with the migration if the schema changes.
 */

export type Purpose = 'download' | 'upload' | 'both';
export type AppStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  place: string | null;
  purpose: Purpose | null;
  language: string | null;
  avatar_url: string | null;
  created_at: string;
  retired_at: string | null;
}

export interface AppRow {
  id: string;
  name: string;
  developer: string | null;
  version: string | null;
  category: string | null;
  description: string | null;
  icon_url: string | null;
  apk_url: string | null;
  apk_size: number | null;
  downloads: number;
  status: AppStatus;
  submitter_email: string | null;
  proof_email: string | null;
  proof_phone: string | null;
  rejection_note: string | null;
  created_at: string;
}

/** Public shape of an app — never leaks proof/submitter contact details. */
export type PublicApp = Omit<AppRow, 'submitter_email' | 'proof_email' | 'proof_phone' | 'rejection_note'>;

export function toPublicApp(row: AppRow): PublicApp {
  // Strip private fields by omitting them (no unused locals).
  const pub: PublicApp = {
    id: row.id,
    name: row.name,
    developer: row.developer,
    version: row.version,
    category: row.category,
    description: row.description,
    icon_url: row.icon_url,
    apk_url: row.apk_url,
    apk_size: row.apk_size,
    downloads: row.downloads,
    status: row.status,
    created_at: row.created_at,
  };
  return pub;
}

export const PURPOSES: Purpose[] = ['download', 'upload', 'both'];

export function isValidEmail(email: string): boolean {
  // Pragmatic check: one @, non-empty local + domain with a dot. Good enough
  // for a verification-code flow (the code itself proves ownership).
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Lowercase + trim so the same address can never register twice with different casing. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
