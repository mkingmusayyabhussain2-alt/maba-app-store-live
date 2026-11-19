"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import {
  apiErrorMessage,
  apiJson,
  initialsOf,
  LANGUAGES,
  PURPOSES,
  purposeLabel,
  type Account,
  type MeResponse,
} from "@/components/types";

type Step = 1 | 2 | 3;

const inputCls = "field";

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-2 flex-1 rounded-full transition ${
            n <= step
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.6)]"
              : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

export default function AccountPage() {
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [bannedEmail, setBannedEmail] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Naya account review mein gaya ho to ye notice dikhta hai (session nahi milta).
  const [pendingNotice, setPendingNotice] = useState(false);

  // Details form
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState<string>("download");
  const [language, setLanguage] = useState<string>("Roman Urdu");

  // Profile view state
  const [editing, setEditing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutDone, setLogoutDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyMe = useCallback((data: MeResponse) => {
    setBannedEmail(data.bannedEmail ?? null);
    setAccount(data.account ?? null);
    if (data.account) {
      const acct = data.account;
      setEmail(acct.email);
      setName(acct.name ?? "");
      setPlace(acct.place ?? "");
      setPurpose(
        PURPOSES.some((p) => p.value === acct.purpose)
          ? (acct.purpose as string)
          : "download",
      );
      setLanguage(acct.language ?? "Roman Urdu");
    }
  }, []);

  const fetchMe = useCallback(async (): Promise<MeResponse> => {
    return apiJson<MeResponse>(
      await fetch("/api/auth/me", { credentials: "same-origin" }),
      "Account ki details load nahi ho sakein.",
    );
  }, []);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    try {
      applyMe(await fetchMe());
    } catch (e) {
      setMeError(e instanceof Error ? e.message : "Account load nahi ho saka.");
    } finally {
      setMeLoading(false);
    }
  }, [applyMe, fetchMe]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMe();
        if (!cancelled) applyMe(data);
      } catch (e) {
        if (!cancelled)
          setMeError(e instanceof Error ? e.message : "Account load nahi ho saka.");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMe, fetchMe]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Code nahi bheja ja saka. Dobara try karo."),
        );
      setInfo("Code email par bhej diya gaya hai — apna inbox check karo.");
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code nahi bheja ja saka.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Code ghalat hai. Dobara try karo."),
        );
      setInfo("Email verify ho gaya — ab apni details bharo.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code verify nahi ho saka.");
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          place: place.trim(),
          purpose,
          language,
        }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Profile save nahi ho saka."),
        );
      const data = (await res.json()) as {
        status?: string;
        account?: unknown;
      };
      if (data.status === "pending") {
        // Account review mein chala gaya — session nahi mila.
        setPendingNotice(true);
        setInfo(null);
        return;
      }
      setInfo("Account ban gaya — khush aamdeed!");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile save nahi ho saka.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          place: place.trim(),
          purpose,
          language,
        }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Profile update nahi ho saka."),
        );
      setEditing(false);
      setInfo("Profile update ho gaya.");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile update nahi ho saka.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/auth/photo", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Photo upload nahi ho saki."),
        );
      setInfo("Photo lag gayi.");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload nahi ho saki.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/photo", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Photo hatayi nahi ja saki."),
        );
      setInfo("Photo hata di gayi.");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo hatayi nahi ja saki.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function permanentLogout() {
    if (!account) return;
    setLogoutBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout-permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: account.email }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Log out nahi ho saka. Dobara try karo."),
        );
      setLogoutDone(true);
      setAccount(null);
      setLogoutConfirm("");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log out nahi ho saka.");
    } finally {
      setLogoutBusy(false);
    }
  }

  if (meLoading) return <Spinner label="Account load ho raha hai…" />;
  if (meError) return <ErrorBox message={meError} onRetry={() => void loadMe()} />;

  // ---- Banned email ----
  if (bannedEmail) {
    return (
      <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🚫
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-red-200">
          Ye email hamesha ke liye band hai
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-red-200/80">
          {bannedEmail} se ab dobara account nahi ban sakta. Agar ye ghalti se
          hua hai to store ke owner se rabta karo.
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

  // ---- Account review mein hai (naya account, abhi approve nahi hua) ----
  if (pendingNotice) {
    return (
      <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          ⏳
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-amber-200">
          Aap ka account review mein hai
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
          Aap ki details save ho gayi hain. Store ka owner 1 din ke andar
          aap ka account approve karega — approve hote hi aap isi page se
          code se login kar sakenge. Tab tak app download ya release nahi kar
          sakte.
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

  // ---- Session hai lekin account abhi approved nahi (approve ke baad reject ho gaya ho to) ----
  if (account && account.name && account.status && account.status !== "approved") {
    const rejected = account.status === "rejected";
    return (
      <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-3xl" aria-hidden>
          {rejected ? "🚫" : "⏳"}
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-amber-200">
          {rejected
            ? "Aap ka account reject kar diya gaya hai"
            : "Aap ka account review mein hai"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
          {rejected
            ? "Owner ne aap ka account approve nahi kiya. Is email se dobara account nahi ban sakta."
            : "Store ka owner 1 din ke andar aap ka account approve karega. Approve hote hi aap login kar sakenge."}
        </p>
        {rejected && account.review_note ? (
          <p className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-amber-200/80">
            Wajah: {account.review_note}
          </p>
        ) : null}
        <Link
          href="/"
          className="btn-install mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
        >
          Store par jao
        </Link>
      </div>
    );
  }

  // ---- Logged-in profile ----
  if (account && account.name) {
    return (
      <div className="animate-fade-up mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-extrabold text-emerald-50">Mera Account</h1>
        {info ? (
          <p className="glass animate-pop-in rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {info}
          </p>
        ) : null}
        {error ? <ErrorBox message={error} /> : null}

        <div className="glass glow-green rounded-3xl p-6 text-center">
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatar_url}
              alt="Profile photo"
              className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-emerald-500 shadow-[0_0_28px_rgba(34,197,94,0.45)]"
            />
          ) : (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-3xl font-black text-white ring-4 ring-emerald-500 shadow-[0_0_28px_rgba(34,197,94,0.45)]">
              {initialsOf(account.name, account.email)}
            </div>
          )}
          <h2 className="mt-4 text-xl font-extrabold text-emerald-50">
            {account.name}
          </h2>
          <p className="mt-0.5 text-sm text-emerald-100/60">{account.email}</p>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Profile photo chuno"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
              e.target.value = "";
            }}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              className="btn-install rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-50"
            >
              {photoBusy
                ? "Upload ho rahi hai…"
                : account.avatar_url
                  ? "Photo Badlo"
                  : "Photo Lagao"}
            </button>
            {account.avatar_url ? (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => void removePhoto()}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-emerald-100/85 hover:bg-white/15 disabled:opacity-50"
              >
                Photo Hatao
              </button>
            ) : null}
          </div>
        </div>

        {editing ? (
          <form onSubmit={updateProfile} className="glass rounded-3xl p-5">
            <h3 className="text-base font-extrabold text-emerald-50">
              Details edit karo
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-name" className="text-sm font-semibold text-emerald-100/75">Naam</label>
                <input id="edit-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="edit-place" className="text-sm font-semibold text-emerald-100/75">Jagah</label>
                <input id="edit-place" className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Sheher / ilaqa" required />
              </div>
              <div>
                <label htmlFor="edit-purpose" className="text-sm font-semibold text-emerald-100/75">Purpose</label>
                <select id="edit-purpose" className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-language" className="text-sm font-semibold text-emerald-100/75">Language</label>
                <select id="edit-language" className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="btn-install flex-1 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 disabled:opacity-50">
                {busy ? "Save ho raha hai…" : "Save karo"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-emerald-100/85 hover:bg-white/15">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="glass rounded-3xl p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-emerald-100/50">Naam</dt><dd className="font-semibold text-emerald-50">{account.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-emerald-100/50">Email</dt><dd className="break-all font-semibold text-emerald-50">{account.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-emerald-100/50">Jagah</dt><dd className="font-semibold text-emerald-50">{account.place ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-emerald-100/50">Purpose</dt><dd className="font-semibold text-emerald-50">{purposeLabel(account.purpose)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-emerald-100/50">Language</dt><dd className="font-semibold text-emerald-50">{account.language ?? "—"}</dd></div>
            </dl>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
              }}
              className="btn-install mt-5 w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950"
            >
              Details Edit Karo
            </button>
          </div>
        )}

        {/* Permanent log out */}
        <div className="glass rounded-3xl border-red-500/30 bg-red-500/5 p-5">
          <h3 className="text-base font-extrabold text-red-300">
            Permanent Log Out
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-red-200/75">
            ⚠️ Ye hamesha ke liye hai! Log out karne ke baad is email se dobara
            account <strong>kabhi nahi</strong> ban sakega. Soch samajh kar
            karo — ye wapas nahi hoga.
          </p>
          {logoutDone ? (
            <p className="mt-3 rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200">
              Account hamesha ke liye band kar diya gaya.
            </p>
          ) : (
            <>
              <label htmlFor="logout-confirm" className="mt-4 block text-sm font-semibold text-red-200/85">
                Confirm karne ke liye apni email likho: {account.email}
              </label>
              <input
                id="logout-confirm"
                type="email"
                className={inputCls}
                value={logoutConfirm}
                onChange={(e) => setLogoutConfirm(e.target.value)}
                placeholder={account.email}
                autoComplete="off"
              />
              <button
                type="button"
                disabled={logoutBusy || logoutConfirm.trim() !== account.email}
                onClick={() => void permanentLogout()}
                className="mt-3 w-full rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-40"
              >
                {logoutBusy ? "Ho raha hai…" : "Hamesha ke liye Log Out karo"}
              </button>
              {logoutConfirm && logoutConfirm.trim() !== account.email ? (
                <p className="mt-2 text-xs text-red-300/80">
                  Email bilkul waisi hi likho jaisi upar dikh rahi hai.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Logged in but profile incomplete -> step 3 ----
  const effectiveStep: Step = account ? 3 : step;

  return (
    <div className="animate-fade-up mx-auto max-w-lg">
      <h1 className="text-xl font-extrabold text-emerald-50">
        {account ? "Apni details poori karo" : "Account Banao"}
      </h1>
      <p className="mt-1 text-sm text-emerald-100/55">
        {account
          ? "Email verify ho gayi hai — bas thori si details reh gayi hain."
          : "Email se account banao — koi password nahi chahiye, code email par aayega."}
      </p>

      <div className="mt-5">
        <StepDots step={effectiveStep} />
      </div>

      {info ? (
        <p className="glass animate-pop-in mt-4 rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {info}
        </p>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {effectiveStep === 1 && (
        <form onSubmit={requestCode} className="glass mt-4 rounded-3xl p-5">
          <h2 className="text-base font-extrabold text-emerald-50">
            Step 1 — Apni email likho
          </h2>
          <label htmlFor="acc-email" className="mt-4 block text-sm font-semibold text-emerald-100/75">
            Email
          </label>
          <input
            id="acc-email"
            type="email"
            required
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="aapki@email.com"
            autoComplete="email"
          />
          <p className="mt-2 text-xs text-emerald-100/45">
            6-digit code isi email par bheja jayega. Code yahan page par kabhi
            nahi dikhaya jayega.
          </p>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="btn-install mt-4 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
          >
            {busy ? "Bhej rahe hain…" : "Code Bhejo"}
          </button>
        </form>
      )}

      {effectiveStep === 2 && (
        <form onSubmit={verifyCode} className="glass mt-4 rounded-3xl p-5">
          <h2 className="text-base font-extrabold text-emerald-50">
            Step 2 — Code likho
          </h2>
          <p className="mt-1 text-sm text-emerald-100/60">
            Code <strong className="text-emerald-200">{email}</strong> par bhej
            diya gaya hai — apna inbox (aur spam folder bhi) check karo.
          </p>
          <label htmlFor="acc-code" className="mt-4 block text-sm font-semibold text-emerald-100/75">
            6-digit code
          </label>
          <input
            id="acc-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={6}
            className={`${inputCls} text-center text-xl font-bold tracking-[0.5em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="btn-install mt-4 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
          >
            {busy ? "Check ho raha hai…" : "Verify Karo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setError(null);
              setInfo(null);
            }}
            className="mt-3 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
          >
            ← Email badlo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestCode()}
            className="mt-1 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300 disabled:opacity-50"
          >
            Code dobara bhejo
          </button>
        </form>
      )}

      {effectiveStep === 3 && (
        <form onSubmit={completeProfile} className="glass mt-4 rounded-3xl p-5">
          <h2 className="text-base font-extrabold text-emerald-50">
            Step 3 — Apni details bharo
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="acc-name" className="text-sm font-semibold text-emerald-100/75">Naam</label>
              <input id="acc-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Apna naam" required />
            </div>
            <div>
              <label htmlFor="acc-place" className="text-sm font-semibold text-emerald-100/75">Jagah</label>
              <input id="acc-place" className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Sheher / ilaqa" required />
            </div>
            <div>
              <label htmlFor="acc-purpose" className="text-sm font-semibold text-emerald-100/75">Purpose</label>
              <select id="acc-purpose" className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-emerald-100/45">
                Sirf Download — bas apps download karni hain. Sirf Upload — bas
                apni app release karni hai. Dono — dono kaam karne hain.
              </p>
            </div>
            <div>
              <label htmlFor="acc-language" className="text-sm font-semibold text-emerald-100/75">Language</label>
              <select id="acc-language" className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="btn-install mt-5 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
          >
            {busy ? "Save ho raha hai…" : "Account Poora Karo"}
          </button>
        </form>
      )}
    </div>
  );
}
