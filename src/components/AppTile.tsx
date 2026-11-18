import Link from "next/link";
import type { AppItem } from "./types";
import { formatDownloads, initialsOf } from "./types";

export function AppIcon({
  app,
  size = "lg",
}: {
  app: Pick<AppItem, "name" | "icon_url">;
  size?: "sm" | "lg";
}) {
  const box =
    size === "lg"
      ? "h-16 w-16 rounded-2xl text-2xl"
      : "h-12 w-12 rounded-xl text-lg";
  if (app.icon_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.icon_url}
        alt={`${app.name} ka icon`}
        className={`${box} object-cover shadow-lg ring-1 ring-white/10`}
      />
    );
  }
  return (
    <div
      className={`${box} flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 font-extrabold text-white shadow-lg ring-1 ring-white/10`}
      aria-hidden
    >
      {initialsOf(app.name)}
    </div>
  );
}

export default function AppTile({
  app,
  index = 0,
}: {
  app: AppItem;
  index?: number;
}) {
  return (
    <Link
      href={`/apps/${app.id}`}
      className="tile glass animate-fade-up flex flex-col items-center rounded-3xl p-4 text-center"
      style={{ animationDelay: `${Math.min(index, 11) * 55}ms` }}
    >
      <AppIcon app={app} />
      <p className="mt-3 w-full truncate text-sm font-bold text-emerald-50">
        {app.name}
      </p>
      <p className="mt-0.5 w-full truncate text-xs text-emerald-100/55">
        {app.developer}
      </p>
      <p className="mt-1 text-[11px] text-emerald-100/45">
        {formatDownloads(app.downloads)} downloads
      </p>
      <span className="btn-install mt-3 inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950">
        Install
      </span>
    </Link>
  );
}
