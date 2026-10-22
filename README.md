# Harmoni Music Class

An interactive LMS for **Music** class: multimedia lessons, quizzes with text/image/audio/video/**MIDI piano** questions, instrument practice (virtual piano, pitch, rhythm, recording), and AI assistance for teachers. Two dashboards: **Teacher** (also the admin) and **Student**. Mobile-first, with light and dark mode.

The interface is in **Bahasa Indonesia by default** and can be switched to **English** at any time with the `EN | ID` toggle (sidebar, sign-in pages, and home page). The choice is remembered in a cookie.

## Contents

1. [Tech stack](#tech-stack)
2. [Quick start](#quick-start)
3. [Signing in as a teacher](#signing-in-as-a-teacher)
4. [Environment variables](#environment-variables)
5. [Feature map](#feature-map)
6. [Languages (i18n)](#languages-i18n)
7. [Production deployment](#production-deployment)
8. [Docker](#docker)
9. [Security](#security)
10. [Assumptions & design decisions](#assumptions--design-decisions)
11. [Known limitations](#known-limitations)
12. [Project structure](#project-structure)

## Tech stack

| Area | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) + React 19 + TypeScript | Server Actions for all mutations, Route Handlers for file upload/download |
| UI | Tailwind CSS v4, shadcn/ui-style components (hand-written in `src/components/ui`) | Light/dark tokens in `globals.css` |
| Database | **PostgreSQL** + **Drizzle ORM** | Without `DATABASE_URL`, development uses **PGlite** (real PostgreSQL running inside Node), so nothing needs to be installed |
| Auth | **Better Auth** (email + password) | `teacher` / `student` role stored on the `user` table |
| Files | Local disk (`./uploads`) or **S3-compatible** storage (AWS S3, Cloudflare R2, MinIO, Supabase Storage) | Selected with `STORAGE_DRIVER` |
| Audio | **Tone.js** (piano & metronome, lazy-loaded), Web Audio API, **Web MIDI API**, **MediaRecorder API** | Low latency: `lookAhead = 0`, `latencyHint: "interactive"` |
| AI | **Claude** via `@anthropic-ai/sdk` (teachers only) | The key is only read on the server; default model `claude-opus-5` |
| Validation | Zod (every input is validated again on the server) | |

**Why PGlite for development?** PGlite is real PostgreSQL (WASM): schema and queries are identical to production, but it needs no Docker or server install. For production just set `DATABASE_URL`.

## Quick start

Requirements: **Node.js 20.9+** (tested on Node 22) and npm.

```bash
npm install
cp .env.example .env.local      # then set BETTER_AUTH_SECRET (see below)
npm run db:seed                 # creates the schema + sample data (skipped if the DB already has data)
npm run dev                     # http://localhost:3000
```

Generate the session secret with `openssl rand -base64 32` and paste it into `BETTER_AUTH_SECRET` in `.env.local`.

Other commands:

| Command | Purpose |
|---|---|
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript type check |
| `npm run db:migrate` | Apply migrations (required for production PostgreSQL) |
| `npm run db:seed` | Migrate + insert sample data |
| `npm run db:reset` | **Local PGlite only**: delete the data and recreate the schema (then run `db:seed`) |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts` |

> PGlite can only be opened by one process at a time. **Stop `npm run dev` (Ctrl+C) before running `db:seed` / `db:reset`.** Killing the dev server with `kill -9` can corrupt the local data; if that happens run `npm run db:reset && npm run db:seed`.

## Teaching documents (Perangkat Ajar)

Under **Teaching Documents** a teacher generates, in this order: **CP – TP – ATP** → **Modul Ajar** (one objective / BAB) → **teacher material** (with a 10 multiple-choice + 5 essay HOTS worksheet and answer key) → **student material** (same worksheet, no answer key). Each result is stored in the library and downloaded as a `.docx`. A teacher can also upload their own CP-TP-ATP (`.docx`, `.pdf`, `.txt`) to be tidied into the same format.

- **AI provider**: Claude Code (`claude -p`, no API key needed when it is installed and logged in on the server), the Anthropic API, the Gemini API, or a local Ollama server (no key, free). With `AI_PROVIDER=auto` the first one available is used, in that order; a teacher can choose another in the UI. The CLI runs in an empty temporary directory with its file/shell tools disabled, and it only works on a server that has `claude` installed (not on serverless or a plain Docker image).
- **Long jobs**: a document takes 1–3 minutes, so generation runs in the background (`after()`), and the page polls the status. Jobs that stay "pending" for more than 20 minutes (e.g. after a restart) are marked as failed and the daily allowance is refunded.
- **Templates**: `/teacher/perangkat-ajar/templates` lists the built-in template and the teacher's own. A template can be created from an existing Modul Ajar / RPM `.docx` (the layout is detected) and edited (sections, order, numbering, font, AI instructions).
- **Question bank**: "Save questions to the question bank" copies the multiple-choice questions of a Modul Ajar (test) or of the teacher material (LKPD). Essay questions are skipped because the LMS has no essay question type.

## Roster, schedule, journal & academic calendar

- **Accounts a teacher creates by hand** (`/teacher/classes/[id]` → "Add a student by hand", or bulk via `/teacher/classes/upload`): the student signs in with a **username + password** instead of an email — there is no working inbox behind the account, so "forgot password" cannot reach them. A teacher resets a student's password from the class page; the new password is shown once and is not stored anywhere in plain text. A student can still register normally with an email (and, if `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, with Google) — the two kinds of accounts otherwise work identically (materials, quizzes, grades). The login form accepts either an email or a username.
- **Bulk upload** (`/teacher/classes/upload`): download the `.xlsx` template, fill in class name / student name / username / password (password optional — left blank means auto-generated), and upload it. Classes that do not exist yet are created; existing ones (matched by name) get the new students added. Up to 300 rows per upload.
- **Teaching Schedule** (`/teacher/schedule`): a plain weekly timetable — day, start/end time, subject, and class (an existing class or free text). No AI involved.
- **Teaching Journal** (`/teacher/journal`): one entry per class meeting, combining the teaching log (material taught, activities, obstacles, notes) with that meeting's attendance (Hadir/Sakit/Izin/Alpa per student, with an optional note). Opening "New entry" for a class/date that already has one edits it instead of creating a duplicate.
- **Academic Calendar** (`/teacher/calendar`): upload a school's official Kalender Pendidikan (`.docx`, `.pdf`, `.xlsx`, or `.txt`); the AI (same provider choice as Teaching Documents) tidies it into semesters, effective weeks, and a list of events (libur / efektif / ujian / PTS / PAS / lainnya), shown as a month-by-month calendar and as tables. Generation runs in the background like Teaching Documents.

## Signing in as a teacher

**With the sample data** (after `npm run db:seed`), open http://localhost:3000/login and use:

| Role | Email | Password |
|---|---|---|
| Teacher (main admin) | `teacher@harmoni.test` | `harmoni123` |
| Students | `student1@harmoni.test` … `student5@harmoni.test` | `harmoni123` |

You land on the Teacher Dashboard at `/teacher`. Students land on `/student`. The sample class is **Music Class 7A** (invite code `MUSIC7A`).

**Creating your own teacher account:** open `/register`, choose **Teacher**, and fill in the form. The **first teacher who registers becomes the main admin**. If `TEACHER_SIGNUP_CODE` is set on the server, the form also asks for that code, so strangers cannot sign up as teachers. Students register with the **Student** role and join a class with the teacher's invite code.

## Environment variables

Copy `.env.example` to `.env.local` (development) or set them on your hosting platform (production).

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | ✅ | Secret used to sign sessions, at least 32 characters |
| `BETTER_AUTH_URL` | ✅ | Public URL of the app, no trailing `/` (e.g. `https://harmoni.example.school`) |
| `DATABASE_URL` | production | `postgres://user:pass@host:5432/db`. Empty = PGlite in `./data/pglite` |
| `AUTO_MIGRATE` | optional | `1` = run migrations automatically at server start (PostgreSQL). PGlite always migrates automatically |
| `STORAGE_DRIVER` | optional | `local` (default) or `s3` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | with `s3` | Use a **private** bucket; files are served through short-lived signed URLs |
| `MAX_UPLOAD_MB` | optional | Upload limit for teachers (default 50) |
| `ANTHROPIC_API_KEY` | for AI | Can also be set by the admin in **AI Settings** (see below), which overrides this. Without any key the AI generator shows "AI is not enabled yet"; everything else works normally |
| `AI_MODEL` | optional | Default `claude-opus-5`. Change (e.g. `claude-sonnet-5`) to reduce cost |
| `AI_FALLBACK` | optional | `on` (default) or `off`. Server-side fallback when the model refuses a request; set `off` behind a proxy or Bedrock/Vertex |
| `AI_DAILY_LIMIT` | optional | AI requests per teacher per day (default 50) |
| `AI_PROVIDER` | optional | Which provider "auto" uses: `auto` (default), `claude-cli`, `anthropic`, `gemini` or `ollama`. `auto` takes Claude Code (`claude`, logged in on the server) when installed, then `ANTHROPIC_API_KEY`, then `GEMINI_API_KEY`, then Ollama when its server answers. Teachers can also pick a provider in the UI (AI Generator and Teaching Documents) |
| `GEMINI_API_KEY` | for Gemini | Google AI Studio key (`GOOGLE_API_KEY` also works). Read only on the server |
| `AI_GEMINI_MODEL` | optional | Default `gemini-2.5-flash` |
| `AI_GEMINI_BASE_URL` | optional | Only for a proxy or a test double |
| `OLLAMA_BASE_URL` | optional | Ollama server address, default `http://localhost:11434` (from Docker: `http://host.docker.internal:11434`) |
| `AI_OLLAMA_MODEL` | optional | Default `qwen2.5:3b`. Must already be pulled (`ollama pull <model>`). Reading a photo needs a vision model (e.g. `granite3.2-vision`) |
| `AI_CLI_MODEL` | optional | Model passed to the Claude Code CLI (empty = its default) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | From a Google Cloud OAuth client (Web application). Without both, "Continue with Google" is hidden and self-registration stays email/password only. Set the authorized redirect URI to `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional | For the password-reset email. Without SMTP the reset link is **printed in the server log** |
| `TEACHER_SIGNUP_CODE` | recommended in production | When set, registering a teacher account requires this code |

### AI Settings (admin only)

The admin (the first teacher who registered, shown as "Teacher · Admin") has an extra **AI Settings** menu (`/teacher/admin/ai`) for the default provider, the Anthropic and Gemini API keys, the Ollama address and model, model names, the fallback switch, the Claude Code model and the daily limit per teacher, with a **Test connection** button per provider. No other teacher or student can open it: the page and every action re-check the admin flag on the server.

- A value saved there **overrides** the matching variable above; a field left empty falls back to the variable, then to the built-in default. Existing `.env`-only setups keep working unchanged.
- API keys are stored **encrypted** (AES-256-GCM, key derived from `BETTER_AUTH_SECRET`) in the `app_setting` table and are never sent back to the browser (only "set …1234"). If you change `BETTER_AUTH_SECRET`, saved keys become unreadable and must be entered again.
- The dashboard shows the admin a notice while no provider is available.

## Feature map

| Feature | Where |
|---|---|
| **Accounts**: register (choose role), sign in/out, forgot password, edit profile & password | `/register`, `/login`, `/forgot-password`, `/teacher/profile`, `/student/profile` |
| **AI provider settings** (admin only): default provider, API keys (encrypted), models, daily limit, connection test | `/teacher/admin/ai` |
| **Student learning space**: Today's Lessons, audio/video/image player, progress, grade history | `/student`, `/student/materials`, `/student/grades` |
| **Interactive questions**: multiple choice, fill-in, true/false (+ image), audio, video, **MIDI piano**; automatic grading; instant feedback | `/teacher/question-bank`, `/teacher/quizzes`, `/student/quizzes` |
| **Instrument practice**: virtual piano + MIDI keyboard, pitch practice, rhythm practice, ear training (intervals, chords, scales), record & play back, metronome | `/student/practice/*` |
| **AI assistance (teachers only)**: generate question drafts and lesson/summary drafts you can edit before saving | `/teacher/ai-generator` |
| **Teaching documents (teachers only)**: AI-written CP-TP-ATP, Modul Ajar, teacher material with a worksheet (LKPD + answer key) and simple student material, downloaded as Word files; custom Modul Ajar templates; multiple-choice questions can be saved to the question bank | `/teacher/perangkat-ajar`, `/teacher/perangkat-ajar/templates` |
| **Lessons & classes**: Markdown editor + media, question bank by topic, invite codes, publish schedule | `/teacher/materials`, `/teacher/classes`, `/teacher/question-bank` |
| **Roster (teachers only)**: add a student by hand (username + password) or bulk-upload classes & students from an `.xlsx` template; reset a hand-created student's password | `/teacher/classes/[id]`, `/teacher/classes/upload` |
| **Teaching Schedule (teachers only)**: weekly timetable by day, time, subject, and class | `/teacher/schedule` |
| **Teaching Journal (teachers only)**: one entry per class meeting — material taught, activities, obstacles, notes — combined with that meeting's attendance | `/teacher/journal` |
| **Academic Calendar (teachers only)**: upload the school's official Kalender Pendidikan; AI tidies it into a month-by-month calendar and event tables | `/teacher/calendar` |
| **Teacher dashboard**: class summary, student progress, "not taken yet", recent activity, quick actions | `/teacher` |
| **Grades & progress**: automatic grade summary, view answers + recordings, CSV download, print/PDF, manual grading | `/teacher/grades`, `/teacher/classes/[id]/students/[id]`, `/teacher/quizzes/[id]` |

## Languages (i18n)

- All UI text in the code is **English**; it is the source of truth (translations live in `src/i18n/id.ts`). The default language for new visitors is Indonesian (`DEFAULT_LOCALE` in `src/i18n/index.ts`).
- `src/i18n/id.ts` holds the **Indonesian** translations. Keys are the English strings; `{0}`, `{1}` are placeholders. A missing key simply falls back to English.
- Server components / actions / route handlers use `const t = await getT()` (`src/i18n/server.ts`); client components use `const t = useT()` (`src/i18n/client.tsx`).
- The language is stored in the `locale` cookie and changed with `LocaleSwitcher` (`src/components/locale-switcher.tsx`). The AI generator writes its output in the selected language.
- Dates are shown in a language-neutral numeric format (`DD/MM/YYYY, HH:mm`, WIB time zone).

To add a string: write it in English inside `t("…")`, then add the Indonesian text to `src/i18n/id.ts`.

## Production deployment

1. Provision a managed **PostgreSQL** (Neon, Supabase, RDS, …) and set `DATABASE_URL`.
2. Provision a private S3-compatible bucket and set `STORAGE_DRIVER=s3` plus the `S3_*` variables.
3. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (must be HTTPS), `TEACHER_SIGNUP_CODE`, `ANTHROPIC_API_KEY`, and SMTP.
4. Run `npm run db:migrate` once (or set `AUTO_MIGRATE=1`), then `npm run build && npm start`.
5. On **Vercel**: do not use PGlite (`DATABASE_URL` is required). Vercel serverless route handlers limit the request body (~4.5 MB), so large teacher video uploads will fail. Student recordings (short audio) are fine. For videos, paste a YouTube/Vimeo/`https://` file link in the lesson editor (supported), or host on a regular Node server (VPS/Docker), which has no such limit.

**Audio recording and MIDI** only work over HTTPS (or `localhost`); that is a browser rule, not an app limitation. Web MIDI is available in Chrome/Edge/Opera (desktop and Android) but not in Safari/iOS, where students can still use the on-screen piano.

## Docker

The repo ships a `Dockerfile` (multi-stage, Next.js *standalone* output, runs as a non-root user) and a `docker-compose.yml` (PostgreSQL 17 + the app).

### Everything in Docker (database + app)

```bash
cp .env.docker.example .env.docker     # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker --profile tools run --rm seed   # optional: sample accounts & data
```

Open http://localhost:3000. Migrations run automatically at start (`AUTO_MIGRATE=1`). Data lives in two volumes: `pgdata` (database) and `uploads` (lesson and recording files).

| Command | Purpose |
|---|---|
| `docker compose --env-file .env.docker logs -f app` | App logs (the password-reset link is printed here without SMTP) |
| `docker compose --env-file .env.docker up -d --build` | Apply code updates |
| `docker compose --env-file .env.docker down` | Stop (data is kept) |
| `docker compose --env-file .env.docker down -v` | Stop **and delete all data** |

For production behind HTTPS, set `BETTER_AUTH_URL=https://your-domain` in `.env.docker`, put a reverse proxy (Caddy/Nginx/Traefik) in front of the app port, and set `TEACHER_SIGNUP_CODE`.

### Only the database in Docker, the app with `npm run dev`

```bash
docker compose --env-file .env.docker up -d db
```

Then in `.env.local`:

```
DATABASE_URL=postgres://harmoni:<POSTGRES_PASSWORD>@localhost:5432/harmoni
```

and run `npm run db:migrate && npm run db:seed && npm run dev`. The database port is only exposed on `127.0.0.1`. With `DATABASE_URL` set, PGlite is not used.

> If you see `permission denied ... /var/run/docker.sock`, add your user to the docker group: `sudo usermod -aG docker $USER`, then log in again.

## Security

- **Roles** are checked in three layers: `proxy.ts` (fast cookie check), the `/teacher` and `/student` layouts (role check on the server), and **every server action** (`requireTeacher()` / `requireStudent()` plus ownership checks).
- Accounts created through the public Better Auth endpoint are **always `student`**. The `teacher` role can only be set from the registration form, which validates `TEACHER_SIGNUP_CODE`. The first teacher becomes the main admin.
- **Answer keys are never sent to students** before a question is answered; grading happens on the server. With instant feedback an answer locks once it is checked. The full explanation only opens after the quiz is submitted. The timer is enforced on the server.
- Students only see their own data: lessons **already published** in their class, their class's quizzes, and their own attempts.
- **Student recordings are private**: only the owner and the teacher of that student can play them.
- Uploads are checked for MIME type and size; SVG is not allowed; files are served with `nosniff` and a `sandbox` CSP.
- The AI key only exists on the server. AI is available to teachers only, with a daily allowance per teacher that is refunded when an AI call fails.
- Login/register/forgot-password rate limits are **in memory per process**. For several instances, replace them with shared storage (Redis).
- CSV cells starting with `= + - @` are neutralized (prevents formula injection).

## Assumptions & design decisions

Where the PRD is silent, the simplest option was chosen:

1. **WIB time zone (UTC+7)** for "today" and all schedules. Every timestamp column is `timestamptz`.
2. **Today's Lessons** = lessons whose publish date is today. Older lessons stay open; lessons dated in the future are **hidden** from students (404).
3. **Quiz grade** = the student's **best** attempt; `maxAttempts` is set per quiz (default 1). Grade 0–100 = score / max score.
4. **Fill-in questions without a key** are graded manually by the teacher ("needs grading"). Manual grading can also override an automatic grade; the quiz grade is recalculated automatically.
5. **MIDI questions**: *ordered* mode (melody) or *chord* mode (any order); an "ignore octave" option; a "play example" option for listen-then-repeat practice (the example notes are sent to the student's device, because that is the example).
6. **Audio/video questions** are answered with multiple choice, fill-in, or true/false (chosen by the teacher).
7. **Rhythm practice** tolerance is ±0.3 beat with audio latency compensation; extra taps reduce the score. **Pitch practice** score = percentage of correct positions.
8. **Recordings** use the microphone (MediaRecorder), max 3 minutes, format depends on the browser (WebM/Opus, or MP4 on Safari).
9. **Report PDF** uses the browser's *Print → Save as PDF* (print stylesheet included); the official download format is **CSV**.
10. **Forgot password** sends email via SMTP; without SMTP the link is printed in the server log (development mode).
11. Deleting a question that students have already answered is **refused** so grades are not lost. Editing a question does not recalculate saved grades.
12. AI uses structured output (JSON Schema) and the result is validated with the same schema as manual questions; invalid AI questions are discarded. Audio/video questions are not generated by AI (they need media).
13. **AI is for teachers only.** Students have no AI feature.

## Known limitations

- The piano uses **synthesis** (Tone.js), not real piano samples, to stay light and avoid large downloads.
- Rate limits are per process (see Security). There are no automated tests yet; verification was done manually (see the flow below).
- Uploads go through the server (not direct-to-S3 presigned uploads); see the Vercel note.
- The time zone is fixed to WIB; there is no per-school time zone setting (multi-tenant is out of scope).

## Manual test flow

1. Sign in as the teacher → **Question Bank** → create one question of each type → **New quiz** → publish.
2. Sign in as a student (`student2@harmoni.test`) → **Quizzes** → take it → view the result.
3. Back as the teacher → **Grades & Reports**: the grades appear automatically; download the CSV; open a student's report.
4. As a student, try to open `/teacher` → you are redirected to `/student`.
5. Toggle `EN | ID` and check that the interface language changes.

## Project structure

```
src/
  app/
    (auth)/            register, login, forgot password, reset password
    teacher/  student/ pages per role (the layout checks the role)
    actions/           server actions (auth, classroom, material, question, quiz, practice, ai)
    api/               auth (Better Auth), upload, files (file server + Range), export (CSV), perangkat (document status + .docx download)
  components/          UI, piano, media player, question/quiz/material forms, quiz runner, practice, AI generator
  db/                  Drizzle schema, connection (PGlite/pg), migrations
  i18n/                English source + Indonesian dictionary, server/client translators, language switch action
  lib/                 auth, session, access (ownership), questions (grading), audio, ai (+ Claude Code CLI), storage, data (aggregation)
  lib/perangkat/       teaching documents: prompts, generator, .docx writers (docx/), templates, text extraction
scripts/               seed, migrate, reset
drizzle/               SQL migration files
```
