export type AppItem = {
  id: string;
  name: string;
  developer: string;
  version: string;
  category: string;
  description: string;
  icon_url: string | null;
  apk_size: number | null;
  downloads: number;
  created_at: string;
};

export type Account = {
  email: string;
  name: string | null;
  place: string | null;
  purpose: string | null;
  language: string | null;
  avatar_url: string | null;
  /** Account review status: 'pending' | 'approved' | 'rejected' (migration 0002). */
  status: string | null;
  review_note: string | null;
};

export type MeResponse = {
  account: Account | null;
  bannedEmail: string | null;
};

/** POST /api/auth/complete-profile ka jawab: status batata hai account chala ya review mein gaya. */
export type CompleteProfileResponse = {
  ok: boolean;
  status?: "pending" | "approved" | "rejected";
  account?: Account | null;
};

export type ReleaseItem = {
  id: string;
  name: string;
  developer: string;
  version: string;
  category: string;
  description: string;
  icon_url: string | null;
  apk_size: number | null;
  status: string;
  submitter_email: string;
  proof_email: string;
  proof_phone: string;
  created_at: string;
};

export const CATEGORIES = [
  "Sab",
  "Games",
  "Apps",
  "Video",
  "Music",
  "Tools",
  "Education",
] as const;

/** Backend stores machine values; the UI shows Roman Urdu labels. */
export const PURPOSES = [
  { value: "download", label: "Sirf Download" },
  { value: "upload", label: "Sirf Upload" },
  { value: "both", label: "Dono" },
] as const;

export function purposeLabel(value: string | null | undefined): string {
  return (
    PURPOSES.find((p) => p.value === value)?.label ?? value ?? "—"
  );
}

export const LANGUAGES = [
  "Roman Urdu",
  "Urdu",
  "English",
  "Punjabi",
  "Sindhi",
  "Pashto",
  "Balochi",
  "Hindi",
  "Arabic",
  "Turkish",
  "Persian",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Portuguese",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Bengali",
  "Tamil",
  "Telugu",
  "Malay",
  "Indonesian",
  "Thai",
  "Vietnamese",
  "Dutch",
  "Swedish",
] as const;

export function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDownloads(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function initialsOf(name: string | null | undefined, email?: string): string {
  const src = (name ?? "").trim() || (email ?? "").trim();
  if (!src) return "M";
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Read a Roman-Urdu error message from an API response, if any. */
export async function apiErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      for (const key of ["message", "error", "detail"]) {
        if (typeof d[key] === "string" && (d[key] as string).trim())
          return d[key] as string;
      }
    }
  } catch {
    // Response had no JSON body — use the fallback.
  }
  return fallback;
}

export async function apiJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
  return (await res.json()) as T;
}
