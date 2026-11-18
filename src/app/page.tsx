"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppTile from "@/components/AppTile";
import { EmptyState, ErrorBox, Spinner } from "@/components/ui";
import { apiJson, CATEGORIES, type AppItem } from "@/components/types";

type AppsResponse = { apps: AppItem[] };

function Section({
  title,
  subtitle,
  apps,
  emptyText,
}: {
  title: string;
  subtitle: string;
  apps: AppItem[];
  emptyText: string;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-emerald-50">{title}</h2>
          <p className="text-xs text-emerald-100/50">{subtitle}</p>
        </div>
      </div>
      {apps.length === 0 ? (
        <p className="glass mt-4 rounded-2xl px-4 py-5 text-center text-sm text-emerald-100/55">
          {emptyText}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {apps.map((app, i) => (
            <AppTile key={app.id} app={app} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>("Sab");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchApps = useCallback(async (): Promise<AppItem[]> => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (category !== "Sab") params.set("category", category);
    const qs = params.toString();
    const data = await apiJson<AppsResponse>(
      await fetch(`/api/apps${qs ? `?${qs}` : ""}`, {
        credentials: "same-origin",
      }),
      "Apps load nahi ho sakein. Dobara try karo.",
    );
    return Array.isArray(data.apps) ? data.apps : [];
  }, [debouncedSearch, category]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await fetchApps());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apps load nahi ho sakein.");
    } finally {
      setLoading(false);
    }
  }, [fetchApps]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchApps();
        if (!cancelled) setApps(result);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Apps load nahi ho sakein.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchApps]);

  const newest = useMemo(
    () =>
      [...apps].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [apps],
  );

  const mostDownloaded = useMemo(
    () => [...apps].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0)),
    [apps],
  );

  const isFiltering = debouncedSearch !== "" || category !== "Sab";

  return (
    <div className="animate-fade-in">
      {/* Search */}
      <div className="glass glow-green flex items-center gap-2 rounded-full px-4 py-1.5">
        <span aria-hidden className="text-lg text-emerald-400">
          🔍
        </span>
        <label htmlFor="store-search" className="sr-only">
          Apps search karo
        </label>
        <input
          id="store-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Apps search karo…"
          className="w-full bg-transparent py-2 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/40"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Search saaf karo"
            className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-emerald-100/80 hover:bg-white/20"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Category chips */}
      <div
        className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Categories"
      >
        {CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={active}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                active
                  ? "bg-emerald-500 text-emerald-950 shadow-[0_0_18px_rgba(34,197,94,0.5)]"
                  : "glass text-emerald-100/75 hover:border-emerald-500/40 hover:text-emerald-50"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Spinner label="Apps load ho rahi hain…" />
      ) : error ? (
        <div className="mt-6">
          <ErrorBox message={error} onRetry={() => void load()} />
        </div>
      ) : apps.length === 0 && !isFiltering ? (
        <div className="mt-8">
          <EmptyState
            title="Store abhi khaali hai"
            body="Abhi koi app approve nahi hui. Jaise hi owner koi app approve karega, woh yahan nazar aayegi. Apni app release karna chahte ho? Neeche Release par jao."
            action={
              <Link
                href="/release"
                className="btn-install inline-flex items-center rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
              >
                Apni App Release Karo
              </Link>
            }
          />
        </div>
      ) : apps.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Kuch nahi mila"
            body="Is search ya category mein koi app nahi hai. Koi aur lafz try karo ya category badlo."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory("Sab");
                }}
                className="btn-install rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
              >
                Sab apps dikhao
              </button>
            }
          />
        </div>
      ) : isFiltering ? (
        <section className="mt-8">
          <h2 className="text-lg font-extrabold text-emerald-50">
            {apps.length} app{apps.length === 1 ? "" : "s"} mili
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {apps.map((app, i) => (
              <AppTile key={app.id} app={app} index={i} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <Section
            title="Nayi apps"
            subtitle="Abhi abhi store mein aayi hain"
            apps={newest}
            emptyText="Abhi koi nayi app nahi hai."
          />
          <Section
            title="Sab se zyada download"
            subtitle="Log sab se zyada ye apps download kar rahe hain"
            apps={mostDownloaded}
            emptyText="Abhi koi download nahi hua."
          />
        </>
      )}
    </div>
  );
}
