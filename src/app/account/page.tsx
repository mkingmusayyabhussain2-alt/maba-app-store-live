"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ErrorBox, Spinner } from "@/components/ui";
import {
  apiErrorMessage,
  apiJson,
  formatDate,
  initialsOf,
  LANGUAGES,
  PURPOSES,
  purposeLabel,
  type Account,
  type AppealStatusResponse,
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

  // Login mode: password (default — username/email + password),
  // code (purana email-code flow), forgot (password reset).
  const [loginMode, setLoginMode] = useState<"password" | "code" | "forgot">("password");
  // Ban notice + appeal — login karte waqt ban mile to ye panel dikhta hai.
  const [banPanel, setBanPanel] = useState<{
    email: string;
    ban_until: string | null;
    review_note: string | null;
  } | null>(null);

  // Password login
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Forgot password (code se naya password)
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  // Username/password set karna (profile view mein)
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credConfirm, setCredConfirm] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [credErr, setCredErr] = useState<string | null>(null);

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
      setCredUsername(acct.username ?? "");
      setCredPassword("");
      setCredConfirm("");
      setCredMsg(null);
      setCredErr(null);
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
      if (!res.ok) {
        // Ban mila ho to ban notice + appeal panel dikhao (code ka error nahi).
        let banData: unknown = null;
        try {
          banData = await res.clone().json();
        } catch {
          // JSON nahi — neeche generic error dikhega.
        }
        const b = banData as {
          banned?: boolean;
          ban_until?: string | null;
          review_note?: string | null;
          email?: string;
        } | null;
        if (b?.banned) {
          setBanPanel({
            email: b.email ?? email.trim(),
            ban_until: b.ban_until ?? null,
            review_note: b.review_note ?? null,
          });
          setError(null);
          setInfo(null);
          return;
        }
        throw new Error(
          await apiErrorMessage(res, "Code nahi bheja ja saka. Dobara try karo."),
        );
      }
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

  async function loginWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ login: loginId.trim(), password: loginPassword }),
      });
      if (!res.ok) {
        // Ban mila ho to ban notice + appeal panel dikhao.
        let banData: unknown = null;
        try {
          banData = await res.clone().json();
        } catch {
          // JSON nahi — neeche generic error dikhega.
        }
        const b = banData as {
          banned?: boolean;
          ban_until?: string | null;
          review_note?: string | null;
          email?: string;
        } | null;
        if (b?.banned) {
          setBanPanel({
            email: b.email ?? loginId.trim(),
            ban_until: b.ban_until ?? null,
            review_note: b.review_note ?? null,
          });
          setError(null);
          setLoginPassword("");
          return;
        }
        throw new Error(
          await apiErrorMessage(res, "Login nahi ho saka. Dobara try karo."),
        );
      }
      setInfo("Login ho gaya — khush aamdeed!");
      setLoginPassword("");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login nahi ho saka.");
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (!res.ok) {
        let banData: unknown = null;
        try {
          banData = await res.clone().json();
        } catch {
          // JSON nahi — neeche generic error dikhega.
        }
        const b = banData as {
          banned?: boolean;
          ban_until?: string | null;
          review_note?: string | null;
          email?: string;
        } | null;
        if (b?.banned) {
          setBanPanel({
            email: b.email ?? forgotEmail.trim(),
            ban_until: b.ban_until ?? null,
            review_note: b.review_note ?? null,
          });
          setError(null);
          return;
        }
        throw new Error(
          await apiErrorMessage(res, "Code nahi bheja ja saka. Dobara try karo."),
        );
      }
      setInfo("Agar is email par account hai to code bhej diya gaya hai — apna inbox check karo.");
      setForgotStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code nahi bheja ja saka.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setError("Dono password ek jaise nahi hain.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          new_password: newPassword,
        }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Password badla nahi ja saka."),
        );
      setInfo("Password badal gaya — ab naye password se login karo.");
      setLoginId(forgotEmail.trim());
      setNewPassword("");
      setNewPasswordConfirm("");
      setForgotCode("");
      setForgotStep(1);
      setLoginMode("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password badla nahi ja saka.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCredentials(e: FormEvent) {
    e.preventDefault();
    if (credPassword !== credConfirm) {
      setCredErr("Dono password ek jaise nahi hain.");
      return;
    }
    setCredBusy(true);
    setCredErr(null);
    setCredMsg(null);
    try {
      const res = await fetch("/api/auth/set-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: credUsername.trim(), password: credPassword }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Username/password save nahi ho sake."),
        );
      setCredMsg("Username/password save ho gaya — ab dobara Gmail code ke baghair login kar sakte ho.");
      setCredPassword("");
      setCredConfirm("");
      await loadMe();
    } catch (err) {
      setCredErr(err instanceof Error ? err.message : "Username/password save nahi ho sake.");
    } finally {
      setCredBusy(false);
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
      setInfo("Account ban gaya — khush aamdeed! Ab neeche username/password set karo taake dobara Gmail code ke baghair login kar sako.");
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

  // ---- Ban hai (session abhi bhi hai to) — ban notice + appeal form ----
  if (account && account.name && account.status === "banned") {
    return (
      <div className="animate-fade-up mx-auto max-w-lg">
        <BanAppealBox
          email={account.email}
          banUntil={account.ban_until}
          reviewNote={account.review_note}
        />
      </div>
    );
  }

  // ---- Session hai lekin account abhi approved nahi (reject ya review mein) ----
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

        {/* Username / password — dobara Gmail code ke baghair login ke liye */}
        <div className="glass rounded-3xl p-5">
          <h3 className="text-base font-extrabold text-emerald-50">
            Login Details
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/60">
            Username:{" "}
            <strong className="text-emerald-50">
              {account.username ?? "set nahi hai"}
            </strong>{" "}
            • Password:{" "}
            <strong className="text-emerald-50">
              {account.has_password ? "set hai" : "set nahi hai"}
            </strong>
          </p>
          <p className="mt-1 text-xs text-emerald-100/45">
            Username/password set karne ke baad dobara login ke liye Gmail code
            ki zaroorat nahi — username ya email + password se login ho jayega.
            Username 3-20 characters ka ho (letters, numbers, underscore) aur
            ek dafa set ho jaye to badla nahi ja sakta.
          </p>
          <form onSubmit={saveCredentials} className="mt-4 space-y-3">
            <div>
              <label htmlFor="cred-username" className="text-sm font-semibold text-emerald-100/75">Username</label>
              <input
                id="cred-username"
                className={inputCls}
                value={credUsername}
                onChange={(e) => setCredUsername(e.target.value)}
                placeholder="jaise: ali_123"
                autoComplete="username"
                disabled={Boolean(account.username)}
                required
              />
              {account.username ? (
                <p className="mt-1 text-xs text-emerald-100/45">
                  Username pehle se set hai — badla nahi ja sakta.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="cred-password" className="text-sm font-semibold text-emerald-100/75">
                {account.has_password ? "Naya password" : "Password"}
              </label>
              <input
                id="cred-password"
                type="password"
                className={inputCls}
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Kam se kam 6 characters"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="cred-confirm" className="text-sm font-semibold text-emerald-100/75">Password dobara likho</label>
              <input
                id="cred-confirm"
                type="password"
                className={inputCls}
                value={credConfirm}
                onChange={(e) => setCredConfirm(e.target.value)}
                placeholder="Password dobara likho"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            {credErr ? <ErrorBox message={credErr} /> : null}
            {credMsg ? (
              <p className="glass animate-pop-in rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {credMsg}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={credBusy}
              className="btn-install w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 disabled:opacity-50"
            >
              {credBusy ? "Save ho raha hai…" : "Username / Password Save Karo"}
            </button>
          </form>
        </div>

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

  // ---- Ban notice + appeal (login karte waqt ban mila ho) ----
  if (banPanel && !account) {
    return (
      <div className="animate-fade-up mx-auto max-w-lg">
        <BanAppealBox
          email={banPanel.email}
          banUntil={banPanel.ban_until}
          reviewNote={banPanel.review_note}
          onBack={() => {
            setBanPanel(null);
            setError(null);
          }}
        />
      </div>
    );
  }

  // ---- Username/password login (default) ----
  if (!account && loginMode === "password") {
    return (
      <div className="animate-fade-up mx-auto max-w-lg">
        <h1 className="text-xl font-extrabold text-emerald-50">Login Karo</h1>
        <p className="mt-1 text-sm text-emerald-100/55">
          Username ya email + password se login karo — Gmail code ki zaroorat
          nahi. Naya account banana hai to neeche code se login karo.
        </p>

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

        <form onSubmit={loginWithPassword} className="glass mt-4 rounded-3xl p-5">
          <div>
            <label htmlFor="login-id" className="text-sm font-semibold text-emerald-100/75">Username ya Email</label>
            <input
              id="login-id"
              className={inputCls}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="username ya aapki@email.com"
              autoComplete="username"
              required
            />
          </div>
          <div className="mt-3">
            <label htmlFor="login-password" className="text-sm font-semibold text-emerald-100/75">Password</label>
            <input
              id="login-password"
              type="password"
              className={inputCls}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Apna password"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || !loginId.trim() || !loginPassword}
            className="btn-install mt-5 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
          >
            {busy ? "Check ho raha hai…" : "Login Karo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForgotEmail(loginId.includes("@") ? loginId.trim() : "");
              setForgotStep(1);
              setError(null);
              setInfo(null);
              setLoginMode("forgot");
            }}
            className="mt-3 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
          >
            Password bhool gaye?
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setError(null);
              setInfo(null);
              setLoginMode("code");
            }}
            className="mt-1 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
          >
            Code se login karo →
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-emerald-100/45">
          Naya account banana hai? Code se login karo — email par code aayega,
          phir details bharo.
        </p>
      </div>
    );
  }

  // ---- Forgot password (code se naya password) ----
  if (!account && loginMode === "forgot") {
    return (
      <div className="animate-fade-up mx-auto max-w-lg">
        <h1 className="text-xl font-extrabold text-emerald-50">
          Password Bhool Gaye?
        </h1>
        <p className="mt-1 text-sm text-emerald-100/55">
          Apni email par 6-digit code mangwayen, phir naya password set karo.
        </p>

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

        {forgotStep === 1 ? (
          <form onSubmit={forgotPassword} className="glass mt-4 rounded-3xl p-5">
            <label htmlFor="forgot-email" className="block text-sm font-semibold text-emerald-100/75">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              className={inputCls}
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="aapki@email.com"
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={busy || !forgotEmail.trim()}
              className="btn-install mt-4 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
            >
              {busy ? "Bhej rahe hain…" : "Code Bhejo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setInfo(null);
                setLoginMode("password");
              }}
              className="mt-3 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
            >
              ← Wapas login karo
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="glass mt-4 rounded-3xl p-5">
            <p className="text-sm text-emerald-100/60">
              Code <strong className="text-emerald-200">{forgotEmail}</strong> par
              bhej diya gaya hai — apna inbox (aur spam folder bhi) check karo.
            </p>
            <label htmlFor="forgot-code" className="mt-4 block text-sm font-semibold text-emerald-100/75">
              6-digit code
            </label>
            <input
              id="forgot-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              className={`${inputCls} text-center text-xl font-bold tracking-[0.5em]`}
              value={forgotCode}
              onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
            />
            <label htmlFor="forgot-new-password" className="mt-4 block text-sm font-semibold text-emerald-100/75">
              Naya password
            </label>
            <input
              id="forgot-new-password"
              type="password"
              className={inputCls}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kam se kam 6 characters"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <label htmlFor="forgot-new-password-confirm" className="mt-3 block text-sm font-semibold text-emerald-100/75">
              Naya password dobara likho
            </label>
            <input
              id="forgot-new-password-confirm"
              type="password"
              className={inputCls}
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              placeholder="Password dobara likho"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={busy || forgotCode.length !== 6 || newPassword.length < 6}
              className="btn-install mt-5 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50"
            >
              {busy ? "Save ho raha hai…" : "Naya Password Save Karo"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void forgotPassword()}
              className="mt-3 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300 disabled:opacity-50"
            >
              Code dobara bhejo
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotStep(1);
                setError(null);
                setInfo(null);
              }}
              className="mt-1 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
            >
              ← Email badlo
            </button>
          </form>
        )}
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
          <button
            type="button"
            onClick={() => {
              setError(null);
              setInfo(null);
              setLoginMode("password");
            }}
            className="mt-3 w-full text-sm font-semibold text-emerald-300/80 hover:text-emerald-300"
          >
            ← Username/password se login karo
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

/**
 * Ban notice + appeal form. Ban hue user ko dikhta hai — login karte waqt
 * ban mile (banPanel) ya session ke saath account page khole (banned
 * branch). Ban ki muddat + wajah, phir appeal: ek waqt mein ek pending
 * appeal; faisla hote hi user ko email aati hai.
 */
function BanAppealBox({
  email,
  banUntil,
  reviewNote,
  onBack,
}: {
  email: string;
  banUntil: string | null;
  reviewNote: string | null;
  onBack?: () => void;
}) {
  const [status, setStatus] = useState<AppealStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<AppealStatusResponse>(
        await fetch(
          `/api/auth/appeal-status?email=${encodeURIComponent(email)}`,
          { credentials: "same-origin" },
        ),
        "Appeal ki haalat load nahi ho saki.",
      );
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Appeal ki haalat load nahi ho saki.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    // Async IIFE — effect body mein sync setState nahi (react-hooks rule).
    (async () => {
      await load();
    })();
  }, [load]);

  async function submitAppeal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, message: msg.trim() }),
      });
      if (!res.ok)
        throw new Error(
          await apiErrorMessage(res, "Appeal nahi bheji ja saki."),
        );
      setInfo("Appeal bhej di gayi — owner review karega aur faisla email par aayega.");
      setMsg("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appeal nahi bheji ja saki.");
    } finally {
      setBusy(false);
    }
  }

  const appeal = status?.appeal ?? null;
  const banned = status?.banned ?? null;
  const until = banned?.ban_until ?? banUntil;
  const note = banned?.review_note ?? reviewNote;
  const banOver = !banned && status !== null;

  return (
    <div className="glass animate-pop-in mx-auto max-w-lg rounded-3xl border-red-500/30 bg-red-500/10 p-6 text-center">
      <p className="text-3xl" aria-hidden>
        🚫
      </p>
      <h1 className="mt-3 text-xl font-extrabold text-red-200">
        Aap ka account ban hai
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-red-200/80">
        {banOver
          ? "Aap ka ban khatam ho gaya hai — ab dobara login kar sakte ho."
          : until
            ? `Aap ka account ${formatDate(until)} tak ban hai. Muddat khatam hote hi account khud-bakhud chal padega.`
            : "Aap ka account permanently ban hai. Is account se ab login, download ya release nahi ho sakta."}
      </p>
      {note ? (
        <p className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-red-200/80">
          Wajah: {note}
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 text-left">
          <ErrorBox message={error} />
        </div>
      ) : null}
      {info ? (
        <p className="glass animate-pop-in mt-4 rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left text-sm text-emerald-200">
          {info}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <Spinner label="Appeal ki haalat load ho rahi hai…" />
        </div>
      ) : banOver ? (
        <Link
          href="/account"
          onClick={(e) => {
            e.preventDefault();
            if (onBack) onBack();
            else window.location.reload();
          }}
          className="btn-install mt-6 inline-flex rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-emerald-950"
        >
          Dobara Login Karo
        </Link>
      ) : appeal?.status === "pending" ? (
        <div className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-left">
          <p className="text-sm font-bold text-amber-200">
            ⏳ Aap ki appeal review mein hai
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-200/80">
            {formatDate(appeal.created_at)} ko bheji thi. Faisla hote hi email
            aayegi — approve hui to account khul jayega.
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-amber-200/70">
            “{appeal.message}”
          </p>
        </div>
      ) : appeal?.status === "approved" ? (
        <div className="mt-4 rounded-2xl bg-emerald-500/10 px-4 py-3 text-left">
          <p className="text-sm font-bold text-emerald-200">
            ✅ Aap ki appeal approve ho gayi — account unblock ho gaya hai.
          </p>
          <p className="mt-1 text-sm text-emerald-200/80">
            Ab dobara login kar sakte ho.
          </p>
        </div>
      ) : (
        <form onSubmit={submitAppeal} className="mt-4 text-left">
          {appeal?.status === "rejected" ? (
            <p className="mb-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-red-200/80">
              Pehli appeal reject ho gayi thi
              {appeal.decided_note ? ` — ${appeal.decided_note}` : ""}. Nayi
              appeal bhej sakte ho.
            </p>
          ) : null}
          <label
            htmlFor="appeal-message"
            className="text-sm font-semibold text-red-200/85"
          >
            Appeal karo — batayen ke account kyun khulna chahiye
          </label>
          <textarea
            id="appeal-message"
            className={`${inputCls} mt-2 min-h-24`}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Jaise: Mera account ghalti se ban hua hai, main dobara aisa nahi karunga…"
            required
            minLength={10}
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={busy || msg.trim().length < 10}
            className="btn-install mt-3 w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 disabled:opacity-50"
          >
            {busy ? "Bhej rahe hain…" : "Appeal Bhejo"}
          </button>
        </form>
      )}

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 w-full text-sm font-semibold text-red-300/80 hover:text-red-300"
        >
          ← Wapas login karo
        </button>
      ) : (
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-white/10 px-6 py-2.5 text-sm font-bold text-emerald-100/85 hover:bg-white/15"
        >
          Store par jao
        </Link>
      )}
    </div>
  );
}
