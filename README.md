# MABA App Store — Live Website

Apni app store: log apps browse aur download karen, developers apni APK
release karen, aur owner approve karne ke baad app public ho jaye.
Roman Urdu interface. Built with **Next.js 16 (App Router) + TypeScript +
Tailwind v4** on the frontend, **Supabase (Postgres + Storage)** as the
backend, and **Gmail SMTP (nodemailer)** for verification emails.

> Backend files: `src/lib/**`, `src/app/api/**`, `supabase/**`.
> UI files (`src/app/page.tsx`, `src/app/apps`, `src/app/account`,
> `src/app/release`, `src/app/admin`, `src/components`) are owned by the UI
> workstream and call the APIs documented below.

---

## Stack — aur yehi stack kyun?

| Piece | Choice | Kyun |
|---|---|---|
| Framework | Next.js 16 App Router + TypeScript | Vercel par one-click deploy, API routes aur pages aik hi repo mein |
| Database + files | Supabase (Postgres + Storage) | **Free tier** mein real Postgres + file storage milta hai, aur Vercel ke saath seedha chalta hai — alag server ya database host karne ki zaroorat nahi |
| Email | Gmail SMTP via nodemailer | Koi paid email service nahi, koi verified domain nahi chahiye. Mail owner ke apne Gmail se jata hai, to Google ka SPF/DKIM saath hota hai aur inbox mein aane ka chance zyada hai |

## Features

- **Public store** — sirf approved apps dikhti hain; search + category filter; newest-first ("Nayi apps"), downloads ke hisaab se sort UI mein hota hai ("Sab se zyada download").
- **App detail + download** — download counter barhta hai, phir APK Supabase Storage se signed URL par redirect hoti hai (APK bucket private hai).
- **Account (email code se)** — email par 6-digit code, phir profile (naam, jagah, purpose, language). **Ek email, ek account, hamesha ke liye.**
- **Account review** — naya account banate hi `pending` mein jata hai aur owner ki approval ka wait karta hai (review website ya `/admin` se). **Pending account ko session nahi milta**: login, app release aur photo upload band rehte hain jab tak owner approve na kare (1 din ke andar). Reject hone par us email ko dobara code nahi milta. Purane accounts (migration 0002 se pehle ke) sab `approved` hain. Owner email (`OWNER_EMAIL`) ko review ki zaroorat nahi — hamesha approved. Wapas login: approved account dobara code se login kar sakta hai (request-code → verify-code → complete-profile session deta hai).
- **Account ban** — owner review website se kisi bhi account ko ban kar sakta hai: **1 ghanta, 6 ghante, 24 ghante, 7 din, 30 din, apni muddat (ghante/din), ya permanent**. Ban hote hi account ka session khatam, login/code/release/photo/profile-update sab band, aur us ki apps public store se gayab ho jati hain (detail aur download bhi 404). **Muddat khatam hote hi ban khud-bakhud utar jata hai** — account dobara `approved` ho jata hai aur us ki apps wapas aa jati hain; owner kisi bhi waqt **Unblock** bhi kar sakta hai. Ban ki wajah `review_note` mein save hoti hai (migration 0003).
- **Permanent Log Out** — account hamesha ke liye band: email `burned_emails` mein jati hai, profile retired mark hoti hai (row rakhi jati hai taake dobara register na ho sake), sessions khatam.
- **Release flow** — login ke baad APK + icon upload, proof email/phone; app `pending` mein jati hai.
- **Owner review** — sirf `OWNER_EMAIL` wali email `/api/admin/releases` dekh sakti hai aur approve/reject kar sakti hai. Approve hote hi app store mein public ho jati hai.

## API routes

Sab JSON hain. User-facing errors Roman Urdu mein hain (`{ error: "..." }`).
Verification code kabhi kisi response mein nahi aata, aur secrets kabhi
responses mein nahi aate.

| Method + path | Auth | Kya karta hai |
|---|---|---|
| `GET /api/apps?search=&category=` | Public | Sirf `approved` apps, newest first. `{ apps: [...] }` (proof/submitter contact nahi hota). Ban hue submitter ki apps chhupi hoti hain. |
| `GET /api/apps/[id]` | Public | Approved app ki detail. Pending/rejected par 404 — ban hue submitter ki app par bhi 404 |
| `GET /api/apps/[id]/download` | Public | Sirf approved. Downloads +1, phir APK par 302 redirect (private bucket ke liye 1-hour signed URL). Ban hue submitter ki app par 404 |
| `POST /api/auth/request-code` `{email}` | — | 6-digit code email karta hai. Burned, rejected ya ACTIVELY banned email par 403 (ban ki muddat + wajah ke saath); khatam hua ban khud utar jata hai. Pending/approved account bhi code mangwa sakta hai (dobara login ke liye). 1 ghante mein 5 se zyada codes par 429. `{ ok: true }` |
| `POST /api/auth/verify-code` `{email, code}` | — | Ghalat code par attempts +1, 400. 5 ghalat koshishon ke baad code lock — naya code chahiye. Sahi code par `maba_verify` cookie (15 min). `{ ok: true }` |
| `POST /api/auth/complete-profile` `{name, place, purpose, language}` | Verify cookie | Naya account: profile `pending` banata hai, session NAHI deta — `{ ok: true, status: 'pending', account }`. Owner: `approved` + session. Dobara login (approved profile): session deta hai — `{ ok: true, status: 'approved', account }`. Pending profile dobara aaye to `{ status: 'pending' }`, session nahi. Rejected par 403. Banned par 403 (ban ki muddat + wajah); khatam hua ban utar kar approved login ho jata hai. |
| `GET /api/auth/me[?email=]` | Session (optional) | `{ account, bannedEmail }`. Account mein `status`, `review_note`, `banned_at` aur `ban_until` bhi hote hain. `?email=` sirf us email ka burned status check karta hai (logout screen ke liye) |
| `POST /api/auth/update-profile` `{name, place, purpose, language}` | Session (approved only) | Profile update. Pending/rejected account par 403 ("account abhi review mein hai"); banned account par 403 (ban ki muddat + wajah). `{ ok: true, account }` |
| `POST /api/auth/photo` (FormData `photo`) | Session (approved only) | Image (PNG/JPG/WEBP/GIF) `avatars` bucket mein, purani photo delete. Pending/rejected account par 403; banned par 403 (ban ki muddat + wajah). `{ avatar_url }` |
| `DELETE /api/auth/photo` | Session (approved only) | Photo + `avatar_url` clear. Pending/rejected account par 403; banned par 403 (ban ki muddat + wajah). `{ ok: true }` |
| `POST /api/auth/logout-permanent` `{email}` | Session + email match | Email hamesha ke liye burn, profile retired, sessions + codes delete, cookies clear. `{ ok: true, banned: true }` |
| `POST /api/release` (FormData) | Session (approved only) | APK (required, `.apk`) + icon (optional image) upload, app `pending`. Pending/rejected account par 403; banned par 403 (ban ki muddat + wajah). `{ ok: true, id, status: 'pending' }` |
| `GET /api/admin/releases` | Owner only | Sab releases (pending/approved/rejected), newest first. `{ releases: [...] }` |
| `POST /api/admin/releases/[id]/approve` | Owner only | Status `approved`. `{ ok: true, app }` |
| `POST /api/admin/releases/[id]/reject` `{note?}` | Owner only | Status `rejected` (+ optional note). `{ ok: true, app }` |

### Auth details (implementers ke liye)

- **Sessions:** `maba_session` cookie — httpOnly, production mein Secure, SameSite=Lax, 30 din. Value random token hai; DB mein sirf uska SHA-256 hash store hota hai (`sessions` table).
- **Verify token:** `maba_verify` cookie — `email.exp.hmac`, HMAC-SHA256 with `SESSION_SECRET`, 15 minute.
- **Codes:** 6-digit, sirf SHA-256 hash store hota hai, 10 minute expiry, 5 ghalat koshishon par lock, 1 ghante mein max 5 codes per email.
- **One email, one account:** `assertEmailUsable` burned list aur `profiles` (active + retired) dono check karta hai — request-code aur complete-profile dono jagah.
- **Owner check:** session email `OWNER_EMAIL` env var se match honi chahiye (case-insensitive).

## Database (Supabase)

Migration: `supabase/migrations/0001_init.sql` — re-runnable (IF NOT EXISTS / ON CONFLICT guards).

Migration `0002_account_review.sql` — account review ke liye: `profiles` mein `status` (`pending`/`approved`/`rejected`, default `pending`), `review_note` aur `reviewed_at` add karta hai, aur migration chalte waqt jitne profiles hain un sab ko `approved` kar deta hai (wo review se pehle ke accounts hain). **Sirf ek dafa chalana hai** — dobara chalane se naye pending accounts bhi approve ho jayenge. Index: `profiles(status, created_at desc)`.

Migration `0003_account_ban.sql` — account ban ke liye, **0002 ke baad chalana hai**: `profiles` mein `banned_at` aur `ban_until` (`timestamptz`, null = permanent ban) add karta hai aur `profiles_status_check` ko badal kar `status` mein `'banned'` bhi allow karta hai. Koi backfill nahi (koi banned account pehle se nahi hai). Column adds idempotent hain; constraint ki tabdeeli DO block mein defensive likhi hai, is liye dobara chalana safe hai.

| Table | Main columns |
|---|---|
| `profiles` | id, email (unique), name, place, purpose (`download`/`upload`/`both`), language (default `Roman Urdu`), avatar_url, created_at, retired_at, status (`pending`/`approved`/`rejected`/`banned`), review_note, reviewed_at, banned_at, ban_until |
| `verification_codes` | id, email, code_hash (SHA-256, kabhi plaintext nahi), expires_at, attempts (default 0), created_at |
| `burned_emails` | email (PK), burned_at, reason |
| `apps` | id, name, developer, version, category, description, icon_url, apk_url, apk_size, downloads (default 0), status (`pending`/`approved`/`rejected`, default `pending`), submitter_email, proof_email, proof_phone, rejection_note, created_at |
| `sessions` | id, email, token_hash (SHA-256), expires_at, created_at |

**RLS OFF hai** — jaan boojh kar. Saara DB access server-side route handlers se service-role client ke zariye hota hai; anon key kabhi write ke liye use nahi hoti. Service-role key waise bhi RLS bypass karti hai.

**Storage buckets** (migration mein banaye jate hain, ya Supabase dashboard se):

| Bucket | Public? | Kya hai |
|---|---|---|
| `apks` | Nahi (private) | APK files — download signed URL se hota hai |
| `icons` | Haan | App icons — direct public URL |
| `avatars` | Haan | Profile photos — direct public URL |

## Local dev setup

```bash
npm install
cp .env.example .env.local   # phir apni values bharen (neeche dekhen)
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type check
```

### Supabase project setup

1. [supabase.com](https://supabase.com) par free project banayen.
2. **SQL Editor** mein `supabase/migrations/0001_init.sql` ka content chala kar tables + buckets banayen (ya `supabase db push` use karen, agar Supabase CLI linked hai).
3. **Settings -> API** se ye teen values `.env.local` mein dalen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Buckets check karen: **Storage** mein `apks` (private), `icons` (public), `avatars` (public) hone chahiye.

### Gmail App Password (verification emails ke liye)

1. Owner ke Google account mein **2-Step Verification ON** karen (zaroori hai).
2. Google Account -> **Security -> App passwords** kholen.
3. App name kuch bhi (masalan "MABA App Store") de kar generate karen — 16 character ka password milega.
4. Use `SMTP_PASS` mein dalen. Ye normal Google password **nahi** hai — ise kabhi chat mein na likhen, aur zaroorat par usi page se revoke kar sakte hain.

> **Dev note:** agar local dev mein `SMTP_USER`/`SMTP_PASS` nahi diye, to code email bhejne ke bajaye console mein log hoga aur `.dev-email-log.json` (gitignored) mein append hoga. **Production mein aisa kabhi nahi hota** — wahan SMTP missing ho to request-code 500 dega, aur code kabhi log nahi hota.

### SESSION_SECRET

Random 32+ character secret:

```bash
openssl rand -hex 32
```

## Vercel deploy

1. GitHub par naya repo banayen aur code push karen.
2. [vercel.com/new](https://vercel.com/new) par repo import karen (Next.js auto-detect hota hai).
3. **Project Settings -> Environment Variables** mein `.env.example` ki saari values dalen (Production scope).
4. Deploy karen. Har push par Vercel auto-deploy karta hai.

## Limitations — imaandari se

- **Code mein koi artificial size limit nahi hai**, lekin Supabase **free tier storage 1 GB** hai aur Vercel serverless requests ki limits hoti hain — **bohat bari APK upload fail ho sakti hai**. Owner ko bari APK se test karna chahiye; agar zaroorat paray to paid tier ya direct-to-storage upload (signed upload URL) ki taraf jana hoga.
- **Verify hua:** `npm run build` pass hota hai, `npx tsc --noEmit` aur `npx eslint` clean hain (0 errors), aur production server local par chala kar pages (`/`, `/account`, `/release`, `/admin` — sab 200) check kiye gaye; bina real Supabase ke API routes saaf Roman Urdu 500 dete hain aur server crash nahi hota.
- **Verify kiye baghair:** real credentials ke baghair ye cheezen check nahi hui hain — real email send (Gmail SMTP), real Supabase connection (tables/buckets/uploads), account/release/admin ka end-to-end flow (dev email-log fallback bhi DB ke baghair trigger nahi hota, kyunki request-code pehle DB mein code save karta hai), aur live Vercel deploy. Ye sab pehli baar real Supabase project + Gmail App Password ke saath test karna hoga.
- Verification emails Gmail ke daily sending limits ke andar rehti hain (normal use ke liye kaafi); bulk/commercial sending ke liye paid email service behtar hoga.
- Admin review sirf ek owner email (`OWNER_EMAIL`) tak mehdood hai — multi-admin ya roles nahi hain.
