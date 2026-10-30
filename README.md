# AI English Teacher

Learn English by having real spoken conversations with an AI teacher. Students sign up, choose their level and goals, tap **Start lesson**, speak into their microphone, and hear the teacher answer in real time through the **Gemini Live API**. After each lesson they get a review with corrections, vocabulary and next steps, and their progress is tracked.

> **Status:** the whole app is built, type-checks, lints, passes its automated tests and builds for production.
> It has **not** been run against a real Supabase project or a real Gemini key (none were available while building). See [What is tested vs. what needs your configuration](#what-is-tested-vs-what-needs-your-configuration) before you launch.

---

## Features

- **Live voice lessons**: browser microphone → Gemini Live over WebSocket → teacher's voice played back. Interruption (barge-in), live transcript, mute, timer, reconnect, and a visualizer driven by real audio levels (flat and grey when nothing is active).
- **10 learning modes**: Free Conversation, Daily English, Grammar, Vocabulary, Pronunciation, Interview, Business, Travel, Storytelling, Role Play. Instructions live in the database and can be switched on/off by admins.
- **Hausa support**: default is English; the teacher gives short Hausa explanations on request (or automatically if the student chose Hausa help in onboarding), then returns to English.
- **Accounts**: sign up, sign in, sign out, password reset, email verification (when enabled in Supabase), persistent sessions, protected routes.
- **Onboarding** with an optional 10-question placement quiz that *suggests* a level (it can always be changed).
- **Dashboard, progress, history, session review, vocabulary notebook, lesson library** (17 seeded lessons stored in the database), settings, plan & usage, admin dashboard, privacy policy, terms.
- **Usage limits** enforced on the server, configurable per plan in the database; subscription architecture ready for Paystack/Stripe (no payment provider is connected and nothing charges anyone).
- **Privacy**: no raw audio is stored. Students can delete a lesson, delete all learning data, or delete their account.

## Technology

React 19 · TypeScript · Vite · Tailwind CSS 3 · React Router · Lucide · Supabase (Auth, Postgres, RLS, Edge Functions) · `@google/genai` · Vitest · React Testing Library · PGlite (in-process Postgres used by the RLS tests).

## Architecture

```
Browser (React)
  │ 1. signs in with Supabase Auth
  │ 2. POST create-live-token  (JWT)
  ▼
Edge Function: create-live-token
  • verifies the user, applies rate-limit + plan limits (server-side)
  • closes any other active session (no parallel mic sessions)
  • builds the teacher system prompt on the server
  • creates the learning_sessions row (service role)
  • asks Gemini for a one-use EPHEMERAL token locked to the Live model
  ▼
Browser connects DIRECTLY to Gemini Live with the ephemeral token
  mic (16 kHz PCM16) ──▶ Gemini ──▶ teacher audio (24 kHz PCM16) ──▶ speaker
  │ 3. transcript lines are saved to Postgres (RLS: own rows only)
  │ 4. End lesson → POST finalize-session
  ▼
Edge Function: finalize-session
  • measures duration on the SERVER, records usage, updates daily stats
  • sends the transcript to a Gemini text model → summary, corrections, vocabulary
  • validates/clamps the AI output before saving
```

The permanent `GEMINI_API_KEY` exists **only** as an Edge Function secret. The browser only ever receives a short-lived, single-use token. There is no `VITE_GEMINI_*` variable anywhere, and an automated test fails if one appears.

Key folders:

| Path | Purpose |
|---|---|
| `src/features/voice/` | state machine, mic capture (AudioWorklet), gapless playback, PCM helpers, transcript buffer, `useLiveSession` hook |
| `src/services/gemini/` | `geminiLiveService.ts` (official SDK wrapper), `liveTokenClient.ts` |
| `src/services/supabase/` | all database access, one file per area |
| `src/pages/`, `src/components/` | screens and reusable UI (`components/ui` is the design system) |
| `supabase/migrations/` | schema, RLS policies, seed data, server-only functions |
| `supabase/functions/` | `create-live-token`, `finalize-session`, `delete-account`, shared prompt builder |

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

1. Create a project at <https://supabase.com>.
2. Put **Project URL** and the **anon public key** (Project Settings → API) into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push          # applies supabase/migrations/*.sql (schema, RLS, seed)
   ```
   The migrations contain no `DROP` statements and are safe to re-run.
4. **Authentication → URL Configuration**: set *Site URL* to your app URL and add `http://localhost:5173/**` and your production URL to *Redirect URLs* (needed for password reset and email links).
5. **Authentication → Providers → Email**: choose whether to require email confirmation. The app handles both.

### 3. Gemini

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Store it as a **server-side secret** (never in `.env.local`):
   ```bash
   supabase secrets set GEMINI_API_KEY=YOUR_KEY
   supabase secrets set ALLOWED_ORIGIN=https://your-app.vercel.app   # production only
   ```
3. Optional overrides (defaults shown):
   ```bash
   supabase secrets set GEMINI_LIVE_MODEL=gemini-3.8-live GEMINI_TEXT_MODEL=gemini-3.8-flash GEMINI_VOICE_NAME=Kore
   ```
   These names came from Google's documentation when this project was built (October 2026). Model names change often, so **re-check** <https://ai.google.dev/gemini-api/docs/live-api> and override them with the secrets above if needed. No code change is required.

### 4. Deploy the Edge Functions

```bash
supabase functions deploy create-live-token
supabase functions deploy finalize-session
supabase functions deploy delete-account
```

### 5. Make yourself an admin

Sign up in the app, then run this once in the Supabase SQL editor (admin rights can never be granted from the browser):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict do nothing;
```

### 6. Run locally

```bash
npm run dev      # http://localhost:5173
```

Microphone access needs a secure context: `localhost` and `https://` both work; plain `http://` on a LAN IP does not.

## Install on a phone (PWA)

The app is an installable web app. After you deploy to HTTPS (Vercel), students can put it on their home screen:

- **Android (Chrome):** an **Install app** card appears on the dashboard and in Settings; or use the browser menu → *Install app*.
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen** (the same card shows these steps).

How it works: `public/manifest.webmanifest` (name, icons, standalone display), `public/sw.js` (service worker), `public/offline.html`, and `src/pwa/`. The service worker only handles same-origin app files: built JS/CSS are cached after the first visit the app shell is saved too, so the dashboard, lessons and progress open offline (per-user snapshots in local storage, erased on sign-out), with an "You are offline" strip. It **never** caches or intercepts Supabase, Gemini or sign-in requests. Voice lessons still need the internet. A new deploy shows an **Update** bar; the new version never activates mid-lesson. The service worker is registered in production builds only. Regenerate the icons with `npm run icons` (pure Python, no extra tools needed).

Not verified: installing on a real Android phone or iPhone (Chrome's own installability check passes in the automated test). Test on both before announcing it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | type-check + production build |
| `npm run preview` | serve the production build |
| `npm run test` / `test:watch` | Vitest |
| `npm run test:e2e` | Playwright browser smoke test (builds against a dummy Supabase URL; no credentials needed) |
| `npm run lint` | ESLint |
| `npm run icons` | regenerate the PWA icons (needs python3) |
| `npm run typecheck` | `tsc --noEmit` |

## Production deployment (Vercel)

1. Import the repository in Vercel (framework preset: Vite).
2. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only.
3. Deploy. `vercel.json` already handles SPA routing and sets `Permissions-Policy: microphone=(self)`.
4. Set `ALLOWED_ORIGIN` (Supabase secret) to your production URL and add it to Supabase Redirect URLs.

## What is tested vs. what needs your configuration

**Automated tests (192, all passing when this was built)**

- Database: the real migrations run against an in-process Postgres (PGlite) and are attacked as ordinary users: cross-user reads/writes/deletes are blocked, users cannot self-promote to admin, cannot edit usage/subscriptions, admins cannot read private conversations, usage accounting uses server time, parallel sessions are closed, deleting data works.
- Edge Function logic (with injected dependencies): unauthorized requests, bad input, plan/daily/monthly limits, burst rate limiting, token minting failure handling, no secret leakage.
- Voice engine: PCM conversion, state machine, transcript assembly, error mapping, and **resource cleanup** (microphone tracks stopped, contexts closed, no duplicate sessions).
- Live screen states, error messages, vocabulary filters, streaks and progress maths, placement scoring, and a scan proving no Gemini key or service-role key appears in frontend code or the build.

**Browser smoke test (`npm run test:e2e`, 43 checks, all passing):** in real Chromium at phone, tablet and desktop widths: landing page, no horizontal scrolling, form validation, protected routes redirect signed-out users (`/dashboard`, `/practice/live`, `/admin`), legal pages, 404, no console errors; plus a fake-microphone run proving `getUserMedia` + the AudioWorklet really produce 16 kHz PCM chunks. It does not sign in or contact Gemini.

**Also verified:** `tsc` (app and functions), ESLint and the production build.

**NOT verified. Please test these yourself after configuring:**

- A real Gemini Live conversation (microphone → Gemini → voice). The SDK calls match the documentation at build time and type-check against the SDK, but no live API call was possible.
- Real Supabase sign-up / sign-in / email flows and Edge Function deployment on Supabase's Deno runtime.
- Actual microphone permission prompts and audio quality on Android Chrome, iOS Safari and desktop browsers.
- Post-lesson feedback quality (depends on the Gemini text model's output).

Do not describe voice as "working" to users until you have completed a full lesson on a real phone.

## Security notes

- Gemini key: server-only secret; browsers receive a single-use ephemeral token (≤ lesson length + 45 s, locked to the Live model and audio output).
- RLS is enabled on every table. Clients cannot write `usage_records`, `daily_learning_stats`, `user_subscriptions`, `user_roles`, or create/modify `learning_sessions` and `grammar_corrections`. Those writes only happen in Edge Functions or SECURITY DEFINER functions granted to `service_role`.
- Admin pages are protected by the database (`has_role`), not just by hiding a button.
- Error messages shown to users never contain keys or stack traces; details go to `system_errors` (admin only).
- No raw audio is stored. Transcripts and AI feedback are stored per user and deletable.
- Ephemeral tokens still reach the browser, so anyone with a valid account could use a token for its short lifetime. Plan limits (daily/monthly/per-lesson) cap this and are enforced when the token is issued.

## Usage and cost considerations

Gemini Live is billed by audio tokens in and out, so cost scales with speaking minutes. Control it with the plan limits in the `plans` table (editable in **Admin → Plans & limits**; defaults: Free 10 min/day and 10 min per lesson, Premium 90 min/day). Check current prices at <https://ai.google.dev/gemini-api/docs/pricing> and start with conservative free limits. Supabase and Vercel free tiers are enough to start. Post-lesson feedback adds one small text-model call per lesson.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Supabase is not configured yet" | `.env.local` missing or dev server not restarted |
| "Unable to connect to the AI teacher" | `GEMINI_API_KEY` secret not set, function not deployed, or model name outdated; check **Admin → Errors** |
| "You have reached your current practice limit" | daily/monthly/lesson limit hit; adjust in Admin → Plans & limits |
| Microphone prompt never appears | page is not on `https://` or `localhost`; browser blocked the site in settings |
| No sound on iPhone | silent switch on, or the lesson was not started with a tap |
| Password-reset link opens the wrong site | Site URL / Redirect URLs not set in Supabase Auth |

## Known limitations and future work

- Pronunciation practice is conversational (the model listens and gives general feedback). There is **no** phoneme-level scoring, and the app never claims one.
- Any "estimated comfort score" is a rough AI estimate, not a measurement.
- Payments are not connected; `src/services/payments/provider.ts` defines the interface for Paystack/Stripe.
- The Playwright suite covers the public/signed-out experience only. Signed-in flows and a full lesson need a live Supabase project and Gemini key to test.
- Privacy Policy and Terms are plain-language starting points. Have a lawyer review them and add your legal entity and contact details before launch.
- Designed to extend later with pronunciation scoring, AI-generated lessons, certificates, gamification, push notifications, school/parent accounts and human teachers.
