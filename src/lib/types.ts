/**
 * Shared row types for the MABA App Store backend.
 * These mirror the tables created in supabase/migrations/0001_init.sql.
 * Keep them in sync with the migration if the schema changes.
 */

export type Purpose = 'download' | 'upload' | 'both';
export type AppStatus = 'pending' | 'approved' | 'rejected';

/**
 * Account review status (migration 0002_account_review.sql + 0003_account_ban.sql).
 * - 'pending': naya account, owner ki approval ka wait kar raha hai.
 *   Aise account ko session nahi milta — login, release aur photo band hain.
 * - 'approved': account chal raha hai (purane accounts backfill se approved).
 * - 'rejected': owner ne reject kar diya — dobara code nahi milega.
 * - 'banned': owner ne account ban kar diya — login, release, photo aur
 *   profile update sab band hain; us ki apps public store se gayab ho jati
 *   hain. Ban ki muddat khatam hote hi account khud-bakhud 'approved' ho
 *   jata hai (ban_until null = permanent ban, kabhi khatam nahi hota).
 * Owner email (OWNER_EMAIL) ko review ki zaroorat nahi — hamesha approved.
 */
export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'banned';

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
  status: AccountStatus;
  review_note: string | null;
  reviewed_at: string | null;
  /** Ban (migration 0003): kab ban hua + kab tak (null = permanent ban). */
  banned_at: string | null;
  ban_until: string | null;
  /** Username/password login (migration 0004): username lowercase store hota hai. */
  username: string | null;
  /**
   * Password ke liye client ko sirf ye pata hota hai ke password set hai ya
   * nahi — hash kabhi client ko nahi bheja jata (toSafeProfile use karen).
   */
  has_password: boolean;
}

/**
 * DB row se client-safe profile: password_hash (aur koi bhi future
 * sensitive column) yahan drop ho jata hai. Jo route bhi profile client ko
 * bhejta hai, use hamesha is se guzarna chahiye.
 */
export function toSafeProfile(
  row: Record<string, unknown> | null | undefined,
): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    name: (row.name as string | null) ?? null,
    place: (row.place as string | null) ?? null,
    purpose: (row.purpose as Purpose | null) ?? null,
    language: (row.language as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    retired_at: (row.retired_at as string | null) ?? null,
    status: (row.status as AccountStatus) ?? 'pending',
    review_note: (row.review_note as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    banned_at: (row.banned_at as string | null) ?? null,
    ban_until: (row.ban_until as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    has_password: Boolean(row.password_hash),
  };
}

/** Ban ki appeal (migration 0004, `appeals` table). */
export type AppealStatus = 'pending' | 'approved' | 'rejected';

export interface Appeal {
  id: string;
  email: string;
  message: string;
  status: AppealStatus;
  created_at: string;
  decided_at: string | null;
  decided_note: string | null;
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

/** Username: 3-20 chars, sirf letters/numbers/underscore. */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

/**
 * Username hamesha lowercase store/likha jata hai — is se login lookup
 * exact match hoti hai aur `lower(username)` unique index ke saath do
 * spellings kabhi nahi banti. Pehle isValidUsername se check karen.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Lowercase + trim so the same address can never register twice with different casing. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
