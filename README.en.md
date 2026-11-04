# Harmoni Music Class

**English** · [Bahasa Indonesia](README.md)

An interactive LMS for **Music** class: multimedia lessons, quizzes with text/image/audio/video/**MIDI piano** questions, instrument practice (virtual piano, pitch, rhythm, recording), and AI assistance for teachers. It is a platform for **many teachers**: one **Super Admin** approves new teachers and watches the server, each teacher runs their own classes, and students learn from their phones. Mobile-first, with light and dark mode.

The interface is in **Bahasa Indonesia by default** and can be switched to **English** at any time with the `EN | ID` toggle (sidebar, sign-in pages, and home page). The choice is remembered in a cookie.

📖 **User guide** (sign-up, sign-in, roles, and every feature, in Indonesian): see the **[Wiki](https://github.com/djrecycle/LMS_Harmoni/wiki)**.

## Screenshots

| | |
|---|---|
| <img src="docs/screenshots/dashboard-guru.png" alt="Teacher dashboard" /><br>**Teacher dashboard** | <img src="docs/screenshots/kuis-midi.png" alt="Quiz answered on the piano" /><br>**Quiz answered on the piano / MIDI keyboard** |
| <img src="docs/screenshots/perangkat-ajar.png" alt="Teaching documents with AI" /><br>**Teaching documents (AI)** | <img src="docs/screenshots/piano-virtual-gelap.png" alt="Virtual piano in dark mode" /><br>**Virtual piano + metronome (dark mode)** |
| <img src="docs/screenshots/status-server.png" alt="Server Status page" /><br>**Server Status** (Super Admin) | <img src="docs/screenshots/pengunjung.png" alt="Visitors page" /><br>**Visitors** (Super Admin) |
| <img src="docs/screenshots/kelola-guru.png" alt="Manage Teachers page" /><br>**Manage Teachers** (Super Admin) | <img src="docs/screenshots/siswa-hp.png" alt="Student home on a phone" width="200" /><br>**Student home on a phone** |

The screenshots show the Indonesian interface.

## Contents

1. [Tech stack](#tech-stack)
2. [Installation](#installation)
3. [Accounts & roles](#accounts--roles)
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
| Auth | **Better Auth** (email/username + password, optional Google for teachers) | `teacher` / `student` role, `isAdmin` flag (one Super Admin) and teacher approval status on the `user` table |
| Files | Local disk (`./uploads`) or **S3-compatible** storage (AWS S3, Cloudflare R2, MinIO, Supabase Storage) | Selected with `STORAGE_DRIVER` |
| Audio | **Tone.js** (piano & metronome, lazy-loaded), Web Audio API, **Web MIDI API**, **MediaRecorder API** | Low latency: `lookAhead = 0`, `latencyHint: "interactive"` |
| AI | **Gemini** or **Anthropic** API (each teacher's own key), plus **Claude Code** CLI and **Ollama** for the Super Admin | Teachers only; keys are stored encrypted and only read on the server |
| Validation | Zod (every input is validated again on the server) | |

**Why PGlite for development?** PGlite is real PostgreSQL (WASM): schema and queries are identical to production, but it needs no Docker or server install. For production just set `DATABASE_URL`.

## Installation

Pick one:

| Option | Best for |
|---|---|
| [A. VPS with a domain (Docker + HTTPS)](#a-vps-with-a-domain-docker--https) | Real use by teachers and students over the internet |
| [B. Local / school server (Docker)](#b-local--school-server-docker) | A school network (LAN) or a single computer |
| [C. Development (Node.js)](#c-development-nodejs) | Trying the app or changing the code |

### A. VPS with a domain (Docker + HTTPS)

**You need:**
- A Linux VPS (Ubuntu 22.04/24.04 or Debian 12) with at least **2 GB RAM** (4 GB recommended) and 20 GB disk.
- A domain or subdomain, e.g. `music.myschool.edu`.
- Ports 80 and 443 open in the VPS firewall.

**1. Point the domain at the VPS.** In your DNS provider, add an **A record** with the VPS's IP address. Wait a few minutes until it resolves (`ping music.myschool.edu`).

**2. Install Docker and Git on the VPS** (log in with SSH, then):

```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y git
```

**3. Download the app:**

```bash
git clone https://github.com/djrecycle/LMS_Harmoni.git /opt/harmoni
cd /opt/harmoni
cp .env.docker.example .env.docker
```

**4. Fill in the configuration.** Generate two random secrets by running this twice:

```bash
openssl rand -base64 32
```

Then open `nano .env.docker` and set:

```ini
POSTGRES_PASSWORD=first-random-value
BETTER_AUTH_SECRET=second-random-value
BETTER_AUTH_URL=https://music.myschool.edu
DOMAIN=music.myschool.edu
```

Keep a safe copy of `.env.docker`. If `BETTER_AUTH_SECRET` changes, everyone has to sign in again and saved AI keys must be entered again. Everything else (SMTP email, Google sign-in, AI) is optional, see [Optional configuration](#optional-configuration).

**5. Start it:**

```bash
docker compose --env-file .env.docker --profile proxy up -d --build
```

The first build takes 5–15 minutes. `--profile proxy` starts **Caddy**, which gets a free HTTPS certificate (Let's Encrypt) automatically. HTTPS is required: browsers only allow audio recording and MIDI over HTTPS.

**6. Create the Super Admin account.** Open `https://music.myschool.edu/register`, choose **Teacher**, and fill in the form. **The first teacher who registers becomes the Super Admin** and is active right away. Do this as soon as the app is up, before sharing the address.

**Day-to-day commands** (run in `/opt/harmoni`):

| Command | Purpose |
|---|---|
| `docker compose --env-file .env.docker ps` | Status of the services (db, app, caddy) |
| `docker compose --env-file .env.docker logs -f app` | App logs (Ctrl+C to quit) |
| `git pull && docker compose --env-file .env.docker --profile proxy up -d --build` | Update to the latest version |
| `docker compose --env-file .env.docker --profile proxy down` | Stop (data is kept) |

The database and uploads live in Docker volumes (`pgdata`, `uploads`), so they survive updates and restarts. **Never** run `down -v`: it deletes all data.

**Manual database backup:**

```bash
docker compose --env-file .env.docker exec -T db pg_dump -U harmoni harmoni | gzip > /root/harmoni-$(date +%F).sql.gz
```

#### Deploying from your laptop (optional)

If you change the code on your laptop, two helper scripts push it to the VPS without a `git pull` on the server. Copy `.deploy.env.example` to `.deploy.env` and set `VPS_HOST` (e.g. `root@203.0.113.10`) and `REMOTE_DIR` (e.g. `/opt/harmoni`). The laptop needs SSH key access to the VPS.

| Script | Purpose |
|---|---|
| `./deploy.sh` | Refuses to run while there are uncommitted changes, syncs the code to the server (rsync, without `node_modules`, data, uploads or env files), rebuilds the stack there in the background, and tags the deployed commit as `deploy-YYYY-MM-DD-HHMM` |
| `./backup.sh` | Dumps the database and copies the code folder on the server (keeps the newest 5), and downloads the dump to `~/harmoni-backups` |

Make a habit of `./backup.sh && ./deploy.sh`.

### B. Local / school server (Docker)

For a computer or server at school (Windows, macOS or Linux).

1. Install **Docker Desktop** (Windows/macOS) or Docker Engine (Linux), and **Git**.
2. Download the app and prepare the configuration:

   ```bash
   git clone https://github.com/djrecycle/LMS_Harmoni.git
   cd LMS_Harmoni
   cp .env.docker.example .env.docker
   ```

3. Open `.env.docker` and set `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` to random text (at least 32 characters). Keep `BETTER_AUTH_URL=http://localhost:3000` when it is only used on that computer.
4. Start it:

   ```bash
   docker compose --env-file .env.docker up -d --build
   ```

5. Open http://localhost:3000 and register as a **Teacher**. This first account becomes the Super Admin.

Sample data (classes, lessons, quizzes and test accounts) can be added with:

```bash
docker compose --env-file .env.docker --profile tools run --rm seed
```

**Using it from other computers on the school network.** By default the app is only reachable from the computer it runs on. Two options:

- **Recommended:** use a domain and HTTPS as in [option A](#a-vps-with-a-domain-docker--https). Caddy can only get a certificate automatically when the server is reachable from the internet.
- **Quick but limited:** in `docker-compose.yml`, change `"127.0.0.1:${APP_PORT:-3000}:3000"` to `"${APP_PORT:-3000}:3000"`, set `BETTER_AUTH_URL=http://SERVER-IP:3000`, and run step 4 again. Students open `http://SERVER-IP:3000`. Without HTTPS, **audio recording and MIDI do not work** on the other computers; everything else does.

### C. Development (Node.js)

Requirements: **Node.js 20.9+** (tested on Node 22) and npm. No PostgreSQL install needed: this mode uses the embedded database (PGlite) in `data/`.

```bash
git clone https://github.com/djrecycle/LMS_Harmoni.git
cd LMS_Harmoni
npm install
cp .env.example .env.local      # then set BETTER_AUTH_SECRET: openssl rand -base64 32
npm run db:seed                 # creates the schema + sample data (skipped if the DB already has data)
npm run dev                     # http://localhost:3000
```

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

### Optional configuration

Set these in `.env.docker` (Docker) or `.env.local` (development), then restart the app. The full list is in [Environment variables](#environment-variables).

| Feature | Variables | Notes |
|---|---|---|
| Password-reset email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Without SMTP the reset link is only printed in the app log |
| Google sign-in for teachers | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (Web application). Redirect URI: `https://your-domain/api/auth/callback/google` |
| Teacher sign-up code | `TEACHER_SIGNUP_CODE` | When set, teacher sign-up requires this code |
| Server AI | `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_PROVIDER` | Used by the Super Admin only. Other teachers use their own key from AI Settings |
| S3 storage | `STORAGE_DRIVER=s3` + `S3_*` | Keep uploads in AWS S3, Cloudflare R2, MinIO, … |

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

## Accounts & roles

| | Super Admin | Teacher | Student |
|---|:---:|:---:|:---:|
| How many | Exactly one | Many | Many |
| How the account is made | The first teacher who registers | Registers (form or Google), then waits for the Super Admin's approval | Registers, or is created by a teacher (username + password) |
| AI features | ✅ (may use the server's AI) | ✅ (with their own API key) | ❌ |
| Upload space | No limit | Limited (default 500 MB, adjustable per teacher) | Practice recordings only |
| Manage Teachers, Server Status, Visitors | ✅ | ❌ | ❌ |

- **Super Admin**: the first teacher account on an installation is the Super Admin and is active at once. There is only one (enforced by a unique index) and the role cannot be handed over in the app.
- **Teachers** must give a **school name** and stay **waiting for approval** (shown on `/account-status`) until the Super Admin approves them in **Manage Teachers**. The Super Admin can also suspend, reactivate or delete teachers, close teacher sign-up, cap the number of teachers, and set the upload space. Each teacher only sees their own classes, students, lessons and quizzes.
- **Google sign-in** (when configured) is for teachers only and always creates a teacher account waiting for approval. Students use email/username + password.
- **Students** register with the **Student** role and join a class with the teacher's invite code, or are created by the teacher. A teacher can also try the student pages with a **test student** (class page → *View as student*); its attempts never count in grades.

**With the sample data** (after `npm run db:seed`), open http://localhost:3000/login and use:

| Role | Email | Password |
|---|---|---|
| Teacher (Super Admin) | `teacher@harmoni.test` | `harmoni123` |
| Students | `student1@harmoni.test` … `student5@harmoni.test` | `harmoni123` |

You land on the Teacher Dashboard at `/teacher`. Students land on `/student`. The sample class is **Music Class 7A** (invite code `MUSIC7A`).

### Super Admin pages

| Page | What it does |
|---|---|
| **Manage Teachers** (`/teacher/admin/teachers`) | Approve, suspend, reactivate or delete teachers; open/close teacher sign-up; maximum number of teachers; upload space per teacher |
| **Server Status** (`/teacher/admin/server`) | Live CPU, RAM, disk, load, uptime, database size and app memory of the VPS (auto-refresh every 10 s); a *Clear app cache* button |
| **Visitors** (`/teacher/admin/traffic`) | Who is online now (teachers, students, guests, bots), page views per minute for the last hour, most opened pages. Kept in memory only, so it starts empty after every deploy or restart |

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
| `ANTHROPIC_API_KEY` | optional | Server AI for the **Super Admin** (can also be set in their AI Settings, which overrides this). Other teachers always use their own key. Without any key the AI features show "AI is not enabled yet"; everything else works normally |
| `AI_MODEL` | optional | Default `claude-opus-5`. Change (e.g. `claude-sonnet-5`) to reduce cost |
| `AI_FALLBACK` | optional | `on` (default) or `off`. Server-side fallback when the model refuses a request; set `off` behind a proxy or Bedrock/Vertex |
| `AI_DAILY_LIMIT` | optional | AI requests per teacher per day (default 50) |
| `AI_PROVIDER` | optional | Which provider "auto" uses: `auto` (default), `claude-cli`, `anthropic`, `gemini` or `ollama`. `auto` takes Claude Code (`claude`, logged in on the server) when installed, then `ANTHROPIC_API_KEY`, then `GEMINI_API_KEY`, then Ollama when its server answers. Teachers can also pick a provider in the UI (AI Generator and Teaching Documents) |
| `GEMINI_API_KEY` | optional | Server Gemini key for the Super Admin (`GOOGLE_API_KEY` also works). Read only on the server |
| `AI_GEMINI_MODEL` | optional | Default `gemini-2.5-flash` |
| `AI_GEMINI_BASE_URL` | optional | Only for a proxy or a test double |
| `OLLAMA_BASE_URL` | optional | Ollama server address, default `http://localhost:11434` (from Docker: `http://host.docker.internal:11434`) |
| `AI_OLLAMA_MODEL` | optional | Default `qwen2.5:3b`. Must already be pulled (`ollama pull <model>`). Reading a photo needs a vision model (e.g. `granite3.2-vision`) |
| `AI_CLI_MODEL` | optional | Model passed to the Claude Code CLI (empty = its default) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | From a Google Cloud OAuth client (Web application). Teachers only: a Google sign-up always creates a teacher waiting for approval. Without both, the Google button is hidden. Set the authorized redirect URI to `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional | For the password-reset email. Without SMTP the reset link is **printed in the server log** |
| `TEACHER_SIGNUP_CODE` | optional | When set, registering a teacher account also requires this code (on top of the Super Admin's approval) |

### AI Settings

Every teacher has an **AI Settings** page (`/teacher/ai-settings`):

- **Teachers** enter their **own Gemini or Anthropic API key** (Gemini has a free tier), so AI usage is billed to their own account. They can pick the provider and model and run **Test connection**. The server's keys are never used for them.
- **The Super Admin** configures the server's AI instead: the default provider (including **Claude Code** and **Ollama** when installed on the server), the Anthropic and Gemini keys, the Ollama address and model, model names, the fallback switch and the daily limit. A value saved there **overrides** the matching variable above; an empty field falls back to the variable, then to the built-in default.
- API keys are stored **encrypted** (AES-256-GCM, key derived from `BETTER_AUTH_SECRET`) in the `app_setting` table and are never sent back to the browser (only "set …1234"). If you change `BETTER_AUTH_SECRET`, saved keys become unreadable and must be entered again.
- There is a daily AI allowance per teacher, refunded when an AI call fails. The dashboard shows a notice while no provider is available.

## Feature map

| Feature | Where |
|---|---|
| **Accounts**: register (choose role), sign in/out, Google sign-in for teachers, forgot password, teacher approval status, edit profile & password | `/register`, `/login`, `/forgot-password`, `/account-status`, `/teacher/profile`, `/student/profile` |
| **AI Settings**: own API key per teacher (encrypted), provider, model, connection test; server AI for the Super Admin | `/teacher/ai-settings` |
| **Super Admin**: approve/suspend teachers, sign-up limits, upload space, server status, visitors | `/teacher/admin/teachers`, `/teacher/admin/server`, `/teacher/admin/traffic` |
| **Student learning space**: Today's Lessons, audio/video/image player, progress, grade history | `/student`, `/student/materials`, `/student/grades` |
| **Interactive questions**: multiple choice, fill-in, true/false (+ image), audio, video, **MIDI piano**; automatic grading; instant feedback | `/teacher/question-bank`, `/teacher/quizzes`, `/student/quizzes` |
| **Instrument practice**: virtual piano + MIDI keyboard, pitch practice, rhythm practice, ear training (intervals, chords, scales), record & play back, metronome | `/student/practice/*` |
| **AI assistance (teachers only)**: generate question drafts and lesson/summary drafts you can edit before saving | `/teacher/ai-generator` |
| **Teaching documents (teachers only)**: AI-written CP-TP-ATP, Modul Ajar, teacher material with a worksheet (LKPD + answer key) and simple student material, downloaded as Word files; custom Modul Ajar templates; multiple-choice questions can be saved to the question bank | `/teacher/perangkat-ajar`, `/teacher/perangkat-ajar/templates` |
| **Lessons & classes**: Markdown editor + media, question bank by topic, invite codes, publish schedule | `/teacher/materials`, `/teacher/classes`, `/teacher/question-bank` |
| **Roster (teachers only)**: add a student by hand (username + password) or bulk-upload classes & students from an `.xlsx` template; reset a hand-created student's password | `/teacher/classes/[id]`, `/teacher/classes/upload` |
| **Teaching Schedule (teachers only)**: weekly timetable by day, time, subject, and class | `/teacher/schedule` |
| **Live Class (teachers only)**: started from the schedule during a lesson; shows which students are online and who has opened each lesson shared in class | `/teacher/live/[id]` |
| **Practice Materials (teachers only)**: extra songs, exercise sheets, audio and demo videos that appear on the Practice page of the chosen classes, with a per-student practice recap | `/teacher/practice-materials` |
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

### Deploying to your own VPS

See [Installation → A. VPS with a domain](#a-vps-with-a-domain-docker--https), including the `deploy.sh` / `backup.sh` helper scripts.

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

- **Roles** are checked in three layers: `proxy.ts` (fast cookie check), the `/teacher` and `/student` layouts (role check on the server), and **every server action** (`requireTeacher()` / `requireStudent()` / `requireAdmin()` plus ownership checks). `requireTeacher()` also rejects teachers who are not approved, are suspended, or have no school name.
- Accounts created through the public Better Auth endpoint are **always `student`**. The `teacher` role can only be set from the registration form (which validates `TEACHER_SIGNUP_CODE` and the sign-up limits) or Google sign-in. New teachers wait for the Super Admin's approval; only the very first teacher becomes the Super Admin.
- **Answer keys are never sent to students** before a question is answered; grading happens on the server. With instant feedback an answer locks once it is checked. The full explanation only opens after the quiz is submitted. The timer is enforced on the server.
- Students only see their own data: lessons **already published** in their class, their class's quizzes, and their own attempts.
- **Student recordings are private**: only the owner and the teacher of that student can play them.
- Uploads are checked for MIME type and size; SVG is not allowed; files are served with `nosniff` and a `sandbox` CSP.
- AI keys only exist on the server (encrypted). AI is available to teachers only, each with their own key and a daily allowance that is refunded when an AI call fails.
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
- The time zone is fixed to WIB; there is no per-school time zone setting.
- The Visitors page keeps its numbers in memory, so they start from zero after every deploy or restart.

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
