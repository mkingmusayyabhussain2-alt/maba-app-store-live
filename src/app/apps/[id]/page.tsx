"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/AppTile";
import { ErrorBox, Spinner } from "@/components/ui";
import {
  apiJson,
  formatDate,
  formatDownloads,
  formatSize,
  type AppItem,
} from "@/components/types";

export default function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<AppItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiJson<{ app: AppItem }>(
          await fetch(`/api/apps/${encodeURIComponent(id)}`, {
            credentials: "same-origin",
          }),
          "App ki details load nahi ho sakein.",
        );
        if (!cancelled) setApp(data.app ?? null);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "App load nahi ho saki.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Spinner label="App load ho rahi hai…" />;
  if (error) return <ErrorBox message={error} />;
  if (!app) {
    return (
      <div className="glass animate-pop-in rounded-3xl px-6 py-12 text-center">
        <p className="text-lg font-bold text-emerald-50">App nahi mili</p>
        <p className="mt-2 text-sm text-emerald-100/60">
          Ye app shayad hata di gayi hai ya link ghalat hai.
        </p>
        <Link
          href="/"
          className="btn-install mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
        >
          Store par wapas jao
        </Link>
      </div>
    );
  }

  const stats = [
    { label: "Downloads", value: formatDownloads(app.downloads) },
    { label: "Size", value: formatSize(app.apk_size) },
    { label: "Version", value: app.version || "—" },
    { label: "Category", value: app.category || "—" },
    { label: "Developer", value: app.developer || "—" },
    { label: "Added", value: formatDate(app.created_at) },
  ];

  return (
    <div className="animate-fade-up">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
      >
        ← Store par wapas
      </Link>

      <div className="glass glow-green mt-4 rounded-3xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <AppIcon app={app} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold text-emerald-50 sm:text-2xl">
              {app.name}
            </h1>
            <p className="mt-0.5 truncate text-sm text-emerald-100/60">
              {app.developer}
            </p>
            <p className="mt-1 text-xs text-emerald-100/45">
              Version {app.version || "—"} • {app.category || "—"}
            </p>
          </div>
        </div>

        <a
          href={`/api/apps/${encodeURIComponent(app.id)}/download`}
          className="btn-install mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 text-base font-extrabold text-emerald-950"
        >
          ⬇️ Install karo
        </a>
        <p className="mt-3 text-center text-xs leading-relaxed text-emerald-100/55">
          APK download hogi, phir Android install ki permission mangega —
          auto-install nahi hai.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {stats.slice(0, 3).map((s) => (
          <div key={s.label} className="glass rounded-2xl px-3 py-4 text-center">
            <p className="text-base font-extrabold text-emerald-50">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-emerald-100/50">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass mt-4 rounded-3xl p-5">
        <h2 className="text-base font-extrabold text-emerald-50">
          App ke baare mein
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-emerald-100/75">
          {app.description?.trim() || "Is app ki koi description nahi di gayi."}
        </p>
        <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
          {stats.slice(3).map((s) => (
            <div key={s.label} className="flex justify-between gap-4">
              <dt className="text-emerald-100/50">{s.label}</dt>
              <dd className="text-right font-semibold text-emerald-50">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
