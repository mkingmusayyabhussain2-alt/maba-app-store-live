import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { BottomNav, TopNav } from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MABA App Store — Apni Apps Download Karo",
  description:
    "MABA App Store — apni pasand ki apps download karo. Nayi apps, sab se zyada download honay wali apps, aur apni app release karo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ur"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <header className="glass-strong sticky top-0 z-40 border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-black text-emerald-950 shadow-[0_0_22px_rgba(34,197,94,0.45)]">
                M
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-base font-extrabold tracking-tight text-emerald-50">
                  MABA <span className="text-emerald-400">App Store</span>
                </span>
                <span className="block truncate text-[11px] text-emerald-100/55">
                  Apni apps, apni store
                </span>
              </span>
            </Link>
            <TopNav />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 md:pb-12">
          {children}
        </main>

        <footer className="mx-auto hidden w-full max-w-5xl px-4 pb-8 text-center text-xs text-emerald-100/40 md:block">
          MABA App Store — apps sirf owner ki approval ke baad public hoti hain.
        </footer>

        <BottomNav />
      </body>
    </html>
  );
}
