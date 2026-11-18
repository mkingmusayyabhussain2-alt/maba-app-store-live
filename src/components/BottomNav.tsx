"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Store", icon: "🏬" },
  { href: "/release", label: "Release", icon: "⬆️" },
  { href: "/account", label: "Account", icon: "👤" },
  { href: "/admin", label: "Admin", icon: "🛡️" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_16px_rgba(34,197,94,0.25)]"
                : "text-emerald-100/70 hover:bg-white/5 hover:text-emerald-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-50 border-t border-white/10 md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                active
                  ? "text-emerald-400"
                  : "text-emerald-100/55 hover:text-emerald-100"
              }`}
            >
              <span aria-hidden className="text-xl leading-none">
                {item.icon}
              </span>
              {item.label}
              <span
                aria-hidden
                className={`h-1 w-6 rounded-full transition ${
                  active ? "bg-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.7)]" : "bg-transparent"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
