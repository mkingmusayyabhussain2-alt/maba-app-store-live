"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import {
  apiErrorMessage,
  apiJson,
  formatDate,
  formatSize,
  type ReleaseItem,
} from "@/components/types";

type ReleasesResponse = { releases: ReleaseItem[] };

const STATUS_LABEL: Record<string, string> = {
  pending: "Review mein",
  approved: "Approve ho gayi",
  rejected: "Reject ho gayi",
};

export default function AdminPage() {
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const fetchReleases = useCallback(async (): Promise<ReleaseItem[]> => {
    const res = await fetch("/api/admin/releases", {
      credentials: "same-origin",
    });
    if (res.status === 403) {
      setForbidden(true);
      return [];
    }
    const data = await apiJson<ReleasesResponse>(
      res,
      "Releases load nahi ho sakein.",
    );
    return Array.isArray(data.releases) ? data.releases : [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      setReleases(await fetchReleases());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Releases load nahi ho sakein.");
    } finally {
      setLoading(false);
    }
  }, [fetchReleases]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchReleases();
        if (!cancelled) setReleases(result);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Releases load nahi ho sakein.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchReleases]);

  async function act(
    id: string,
    action: "approve" | "reject",
    note?: string,
  ) {
    setActingId(id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/releases/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(note ? { note } : {}),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(
            res,
            action === "approve"
              ? "Approve nahi ho saki."
              : "Reject nahi ho saki.",
          ),
        );
      setInfo(
        action === "approve"
          ? "App approve ho gayi — ab store mein public hai."
          : "App reject kar di gayi.",
      );
      setRejectingId(null);
      setRejectNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaam nahi ho saka.");
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <Spinner label="Releases load ho rahi hain…" />;

  if (forbidden) {
    return (
      <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🛡️
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-emerald-50">
          Sirf owner ke liye hai
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-emerald-100/60">
          Ye page sirf store ka owner dekh sakta hai. Aap owner nahi hain to
          yahan kuch nahi hai.
        </p>
        <Link
          href="/"
          className="btn-install mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
        >
          Store par jao
        </Link>
      </div>
    );
  }

  if (error) return <ErrorBox message={error} onRetry={() => void load()} />;

  const visible =
    filter === "pending"
      ? releases.filter((r) => r.status === "pending")
      : releases;

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <h1 className="text-xl font-extrabold text-emerald-50">Admin — Review</h1>
      <p className="mt-1 text-sm text-emerald-100/55">
        Nayi apps yahan review karo. Approve karne par app store mein public ho
        jayegi.
      </p>

      {info ? (
        <p className="glass animate-pop-in mt-4 rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {info}
        </p>
      ) : null}

      <div className="mt-5 flex gap-2" role="group" aria-label="Filter">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              filter === f
                ? "bg-emerald-500 text-emerald-950 shadow-[0_0_18px_rgba(34,197,94,0.5)]"
                : "glass text-emerald-100/75 hover:text-emerald-50"
            }`}
          >
            {f === "pending" ? "Pending" : "Sab"}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-emerald-100/50">
          {releases.filter((r) => r.status === "pending").length} pending
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="glass mt-4 rounded-3xl px-6 py-12 text-center">
          <p className="text-3xl" aria-hidden>
            🎉
          </p>
          <p className="mt-3 font-bold text-emerald-50">
            {filter === "pending"
              ? "Koi pending app nahi hai"
              : "Abhi koi release nahi hai"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-emerald-100/55">
            {filter === "pending"
              ? "Sab apps review ho chuki hain. Nayi app aate hi yahan nazar aayegi."
              : "Abhi tak kisi ne koi app submit nahi ki."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((r, i) => (
            <li
              key={r.id}
              className="glass animate-fade-up rounded-3xl p-5"
              style={{ animationDelay: `${Math.min(i, 11) * 55}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-extrabold text-emerald-50">{r.name}</h2>
                  <p className="mt-0.5 text-sm text-emerald-100/60">
                    {r.developer} • Version {r.version} • {r.category}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                    r.status === "pending"
                      ? "bg-amber-500/15 text-amber-300"
                      : r.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-emerald-100/70">
                {r.description || "Koi description nahi di gayi."}
              </p>

              <dl className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-xs text-emerald-100/60">
                <div className="flex justify-between gap-4">
                  <dt>Submitter</dt>
                  <dd className="break-all font-semibold text-emerald-100/85">{r.submitter_email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Proof email</dt>
                  <dd className="break-all font-semibold text-emerald-100/85">{r.proof_email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Proof phone</dt>
                  <dd className="font-semibold text-emerald-100/85">{r.proof_phone}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>APK size</dt>
                  <dd className="font-semibold text-emerald-100/85">{formatSize(r.apk_size)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Submitted</dt>
                  <dd className="font-semibold text-emerald-100/85">{formatDate(r.created_at)}</dd>
                </div>
              </dl>

              {r.status === "pending" ? (
                <div className="mt-4">
                  {rejectingId === r.id ? (
                    <div className="animate-pop-in rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <label htmlFor={`reject-note-${r.id}`} className="text-sm font-semibold text-emerald-100/75">
                        Reject ki wajah (optional)
                      </label>
                      <input
                        id={`reject-note-${r.id}`}
                        className="field mt-2"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Wajah likho…"
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={actingId === r.id}
                          onClick={() => void act(r.id, "reject", rejectNote.trim() || undefined)}
                          className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {actingId === r.id ? "Ho raha hai…" : "Reject Confirm Karo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectNote("");
                          }}
                          className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-emerald-100/85"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => void act(r.id, "approve")}
                        className="btn-install flex-1 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 disabled:opacity-50"
                      >
                        {actingId === r.id ? "Ho raha hai…" : "✅ Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => setRejectingId(r.id)}
                        className="flex-1 rounded-full bg-red-500/85 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
