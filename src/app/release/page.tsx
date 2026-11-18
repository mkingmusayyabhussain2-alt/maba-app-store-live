"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import { apiErrorMessage, apiJson, CATEGORIES, type MeResponse } from "@/components/types";

const inputCls = "field";

export default function ReleasePage() {
  const [checking, setChecking] = useState(true);
  const [hasAccount, setHasAccount] = useState(false);

  const [name, setName] = useState("");
  const [developer, setDeveloper] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [category, setCategory] = useState<string>("Apps");
  const [description, setDescription] = useState("");
  const [proofEmail, setProofEmail] = useState("");
  const [proofPhone, setProofPhone] = useState("");
  const [apk, setApk] = useState<File | null>(null);
  const [icon, setIcon] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<MeResponse>(
          await fetch("/api/auth/me", { credentials: "same-origin" }),
          "Account check nahi ho saka.",
        );
        if (!cancelled) setHasAccount(!!data.account?.name);
      } catch {
        if (!cancelled) setHasAccount(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!apk) {
      setError("APK file zaroori hai — pehle apni app ki APK chuno.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("developer", developer.trim());
      fd.append("version", version.trim());
      fd.append("category", category);
      fd.append("description", description.trim());
      fd.append("proof_email", proofEmail.trim());
      fd.append("proof_phone", proofPhone.trim());
      fd.append("apk", apk);
      if (icon) fd.append("icon", icon);

      const res = await fetch("/api/release", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "App submit nahi ho saki. Dobara try karo."),
        );
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "App submit nahi ho saki.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <Spinner label="Account check ho raha hai…" />;

  if (!hasAccount) {
    return (
      <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🔐
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-emerald-50">
          Pehle account banao
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-emerald-100/60">
          App release karne ke liye pehle apna account banana zaroori hai. Ye
          sirf 1 minute ka kaam hai — email par code aayega, koi password nahi.
        </p>
        <Link
          href="/account"
          className="btn-install mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
        >
          Account Banao
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="glass glow-green animate-pop-in mx-auto max-w-lg rounded-3xl p-6 text-center">
        <p className="text-3xl" aria-hidden>
          ✅
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-emerald-50">
          Application mil gayi!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-emerald-100/70">
          Your application is under review — please wait 2 business days.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-100/55">
          Owner aapki app check karega. Approve hote hi woh store mein public
          ho jayegi.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="btn-install rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
          >
            Store Dekho
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setName("");
              setDeveloper("");
              setVersion("1.0.0");
              setCategory("Apps");
              setDescription("");
              setProofEmail("");
              setProofPhone("");
              setApk(null);
              setIcon(null);
            }}
            className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-bold text-emerald-100/85 hover:bg-white/15"
          >
            Aur App Submit Karo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up mx-auto max-w-lg">
      <h1 className="text-xl font-extrabold text-emerald-50">
        Apni App Release Karo
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-emerald-100/55">
        Apni app ki details bharo aur APK upload karo. Owner review ke baad
        approve karega — tabhi app store mein public hogi.
      </p>

      {error ? (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      <form onSubmit={submit} className="glass mt-5 space-y-4 rounded-3xl p-5">
        <div>
          <label htmlFor="rel-name" className="text-sm font-semibold text-emerald-100/75">App ka naam *</label>
          <input id="rel-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Meri App" required />
        </div>
        <div>
          <label htmlFor="rel-dev" className="text-sm font-semibold text-emerald-100/75">Developer ka naam *</label>
          <input id="rel-dev" className={inputCls} value={developer} onChange={(e) => setDeveloper(e.target.value)} placeholder="Developer / company ka naam" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rel-version" className="text-sm font-semibold text-emerald-100/75">Version *</label>
            <input id="rel-version" className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" required />
          </div>
          <div>
            <label htmlFor="rel-category" className="text-sm font-semibold text-emerald-100/75">Category *</label>
            <select id="rel-category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.filter((c) => c !== "Sab").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="rel-desc" className="text-sm font-semibold text-emerald-100/75">Description *</label>
          <textarea id="rel-desc" className={`${inputCls} min-h-24 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="App kya karti hai? Logon ko kyun pasand aayegi?" required />
        </div>

        <div>
          <label htmlFor="rel-apk" className="text-sm font-semibold text-emerald-100/75">APK file *</label>
          <input
            id="rel-apk"
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            required
            className="mt-1 block w-full cursor-pointer rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-3 text-sm text-emerald-100/80 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-emerald-950"
            onChange={(e) => setApk(e.target.files?.[0] ?? null)}
          />
          {apk ? (
            <p className="mt-1 text-xs text-emerald-300/80">
              {apk.name} — {(apk.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-100/45">
              Sirf APK file upload karo — APK yahan nahi banti, pehle se bani
              hui APK chahiye.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="rel-icon" className="text-sm font-semibold text-emerald-100/75">App icon (optional)</label>
          <input
            id="rel-icon"
            type="file"
            accept="image/*"
            className="mt-1 block w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-sm text-emerald-100/80 file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-4 file:py-2 file:text-sm file:font-bold file:text-emerald-50"
            onChange={(e) => setIcon(e.target.files?.[0] ?? null)}
          />
          {icon ? <p className="mt-1 text-xs text-emerald-300/80">{icon.name}</p> : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-bold text-emerald-50">
            Proof — sirf ye do cheezein
          </p>
          <p className="mt-1 text-xs text-emerald-100/50">
            Owner aapse rabta kar sake, is liye email aur phone number zaroori
            hain. Ye public nahi dikhaye jayenge.
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="rel-proof-email" className="text-sm font-semibold text-emerald-100/75">Email *</label>
              <input id="rel-proof-email" type="email" className={inputCls} value={proofEmail} onChange={(e) => setProofEmail(e.target.value)} placeholder="aapki@email.com" required />
            </div>
            <div>
              <label htmlFor="rel-proof-phone" className="text-sm font-semibold text-emerald-100/75">Phone number *</label>
              <input id="rel-proof-phone" type="tel" className={inputCls} value={proofPhone} onChange={(e) => setProofPhone(e.target.value)} placeholder="03XX-XXXXXXX" required />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn-install w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
        >
          {busy ? "Submit ho rahi hai…" : "App Submit Karo"}
        </button>
        <p className="text-center text-xs text-emerald-100/45">
          Submit karne ke baad app seedha public nahi hogi — pehle owner
          review karega.
        </p>
      </form>
    </div>
  );
}
