# Mini Golf Masters — Claude Code Project Context

This file provides full context for every Claude Code session. Read it completely before writing any code.

---

## Project Overview

**Mini Golf Masters** is an invite-only, mobile-first web app for managing an mini golf tournaments among a small-ish community. It tracks scores hole-by-hole, manages tournament setup, and preserves history.

The app needs to be essentially free to run. It is hosted on Render's free tier using Google Sheets as the database.

---

## Hosting & Infrastructure

- **Repo structure:** Single GitHub monorepo, two Render services defined in `render.yaml` at the repo root
- **Backend:** Render Free Web Service (FastAPI/Python) — root directory `backend/`, spins down after 15 min inactivity, acceptable for this use case
- **Frontend:** Render Static Site (React + Vite) — root directory `frontend/`, always on, free
- **Database:** Google Sheets via Google Sheets API (service account auth)
- **Email:** Python `smtplib` via Gmail App Password (stored as env var) — used for invites and contact form notifications. No third-party email service.

---

## File Structure

```
render-minigolfmasters/
│
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Environment variables, settings
│   ├── sheets.py                # Google Sheets read/write abstraction layer
│   ├── auth.py                  # JWT creation, validation, invite token logic
│   ├── dependencies.py          # FastAPI dependencies (get_current_user, require_admin, require_tournament_admin)
│   │
│   ├── routers/
│   │   ├── auth.py              # POST /login, POST /accept-invite, POST /reset-password
│   │   ├── users.py             # GET/POST /users, POST /users/invite
│   │   ├── tournaments.py       # GET/POST /tournaments, GET /tournaments/{id}
│   │   ├── registrations.py     # GET/POST /registrations, PATCH /registrations/{id}
│   │   ├── rounds.py            # GET/POST /rounds, rounds per tournament
│   │   ├── courses.py           # GET/POST /courses, holes per course
│   │   ├── pars.py              # GET/POST /pars (resolved by tournament start_date)
│   │   ├── handicaps.py         # GET/POST /handicaps (resolved by tournament start_date)
│   │   └── scores.py            # GET/POST/PATCH /scores
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── tournament.py
│   │   ├── registration.py
│   │   ├── round.py
│   │   ├── course.py
│   │   ├── hole.py
│   │   ├── score.py
│   │   ├── par.py
│   │   └── handicap.py
│   │
│   ├── poetry.lock
│   ├── pyproject.toml
│   └── render.yaml
│
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── images/              # All brand assets — logo, photos, favicon, etc.
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              # Routing, auth context
│   │   │
│   │   ├── api/
│   │   │   └── client.js        # Fetch wrapper, attaches JWT to all requests
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Current user, login/logout state
│   │   │
│   │   ├── components/
│   │   │   ├── Layout.jsx       # Mobile shell, bottom tab nav
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── ScoreStepper.jsx # Large +/- tap input for hole scores (most important UI component)
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.jsx         # Public marketing page — story, about, latest tournament highlight
│   │   │   ├── Contact.jsx      # Public contact form + founder/organizer info
│   │   │   ├── Login.jsx
│   │   │   ├── AcceptInvite.jsx
│   │   │   ├── Tournaments.jsx  # All tournaments (public) + "My Registrations" for logged-in users
│   │   │   ├── Scorecard.jsx    # Score entry — reached via "Add Scores" CTA on My Registrations
│   │   │   ├── Leaderboard.jsx  # Tournament leaderboard (public)
│   │   │   ├── History.jsx      # All scores, all years, all players (public)
│   │   │   └── admin/
│   │   │       ├── Dashboard.jsx
│   │   │       ├── ManageTournament.jsx  # Create tournament, manage rounds, review/accept/reject/forfeit registrations
│   │   │       ├── ManageCourses.jsx     # Create courses & holes, update pars
│   │   │       └── ManageUsers.jsx       # Invite/remove users, update roles, set handicaps
│   │
│   ├── package.json
│   └── vite.config.js
│
├── .env.example
├── .gitignore
├── render.yaml                  # Root-level Render deployment config
└── CLAUDE.md                    # This file
```

---

## render.yaml

```yaml
services:
  - type: web
    name: minigolfmasters-api
    runtime: python
    rootDir: backend
    buildCommand: pip install -r poetry.lock
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    plan: free
    envVars:
      - key: GOOGLE_SHEET_ID
        sync: false
      - key: GOOGLE_SERVICE_ACCOUNT_JSON
        sync: false
      - key: JWT_SECRET_KEY
        sync: false
      - key: JWT_ALGORITHM
        value: HS256
      - key: JWT_EXPIRY_HOURS
        value: 72
      - key: ADMIN_EMAIL
        sync: false
      - key: GMAIL_APP_PASSWORD
        sync: false
      - key: ENVIRONMENT
        value: production
      - key: FRONTEND_URL
        sync: false

  - type: static
    name: minigolfmasters-web
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    plan: free
    envVars:
      - key: VITE_API_URL
        sync: false
```

---

## Database: Google Sheets

Google Sheets is the database. There is one Google Spreadsheet with one tab per table. The `sheets.py` file is the **only** place in the codebase that knows about Google Sheets — all routers call `sheets.py` functions, never the Sheets API directly. This means the database could be swapped later by only touching `sheets.py`.

### Sheet Tabs (Tables)

| Tab | Key Columns |
|---|---|
| `users` | user_id, first_name, last_name, email, password_hash, invite_token, role, created_at |
| `courses` | course_id, name, address, description |
| `holes` | hole_id, course_id, hole_number |
| `pars` | par_id, hole_id, par_strokes, active_from, active_to |
| `handicaps` | handicap_id, user_id, strokes, active_from, active_to |
| `tournaments` | tournament_id, name, start_date, end_date, status, tournament_admin_id |
| `rounds` | round_id, tournament_id, course_id, round_number, label |
| `scores` | score_id, user_id, registration_id, round_id, hole_id, strokes, submitted_at, last_modified_by |
| `registrations` | registration_id, tournament_id, user_id, status, submitted_at |

### Key Design Notes

- **Pars are slowly-changing dimensions (SCD).** `active_from` is the date the par was set; `active_to` defaults to `9999-12-31`. When a par is updated: set the previous record's `active_to` to today, insert a new record with `active_from` = today. To resolve the correct par for a tournament, filter where `active_from <= tournament.start_date AND active_to >= tournament.start_date`.
- **Handicaps follow the same SCD pattern.** Resolve using `tournament.start_date` the same way.
- **`last_modified_by`** on scores stores the `user_id` of whoever last wrote the score, enabling transparent tracking of admin overrides.
- **`tournament_admin_id`** is the `user_id` of the admin who created the tournament. They are the only user (besides a global admin) who can edit that tournament's details, manage its rounds, review registrations, and override player scores. Global admins retain read access to all tournaments.
- **Rounds** represent one play-through of a course within a tournament. Course A × 2 = two round records. Labels should be human-readable, e.g. "Course A – Round 1".
- **Registration statuses:** `in_review` → `accepted` or `rejected`. Accepted registrations can later become `forfeit`. Forfeiting requires a confirmation dialog before proceeding.
- **Forfeit players** remain on the leaderboard but are visually marked as forfeit and sorted to the bottom regardless of score.

---

## Authentication & User System

- **Invite-only accounts.** Only global admins can send invites.
- Invite flow: Admin enters name + email + role in ManageUsers → app generates a unique invite token → emails a signup link → user clicks link → sets password → account activated.
- Passwords stored as **bcrypt hashes**, never plaintext.
- Sessions use **JWTs** stored client-side (localStorage), sent as Bearer tokens on every API request.
- Role is embedded in the JWT payload: `player` or `admin`.
- `dependencies.py` provides:
  - `get_current_user` — any authenticated user
  - `require_admin` — global admin only
  - `require_tournament_admin` — must be the `tournament_admin_id` for the specific tournament, or a global admin

---

## Access Control

| Action | Public | Player | Tournament Admin | Global Admin |
|---|---|---|---|---|
| View home / marketing page | ✅ | ✅ | ✅ | ✅ |
| View all tournaments | ✅ | ✅ | ✅ | ✅ |
| View leaderboard | ✅ | ✅ | ✅ | ✅ |
| View score history (all years) | ✅ | ✅ | ✅ | ✅ |
| Submit contact form | ✅ | ✅ | ✅ | ✅ |
| Register for a tournament | ❌ | ✅ | ✅ | ✅ |
| View "My Registrations" | ❌ | ✅ | ✅ | ✅ |
| Submit own scores (active tournament only) | ❌ | ✅ | ✅ | ✅ |
| Edit own scores (active tournament only) | ❌ | ✅ | ✅ | ✅ |
| Forfeit own registration | ❌ | ✅ | ✅ | ✅ |
| Override any player's scores | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Edit tournament details & rounds | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Accept / reject / forfeit registrations | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Invite users / set roles | ❌ | ❌ | ❌ | ✅ |
| Create tournaments | ❌ | ❌ | ❌ | ✅ |
| Manage courses, holes, pars | ❌ | ❌ | ❌ | ✅ |
| Set player handicaps | ❌ | ❌ | ❌ | ✅ |

### Score Submission Rules

- Scores can only be submitted or edited by players when tournament status is `active`.
- Once a tournament is `complete`, player score submission and editing is locked.
- Only the tournament admin or global admin can modify scores on a completed tournament.

---

## Tournaments Page

- **Public section:** All tournaments listed (upcoming, active, complete) — visible to everyone.
- **"My Registrations" section:** Shown only to logged-in users. Lists all tournaments the user has registered for with their registration status (`in_review`, `accepted`, `rejected`, `forfeit`).
- **CTA per registration:** Accepted registrations for an `active` tournament show an "Add Scores" button navigating to the Scorecard for that tournament.

---

## Contact Page (`/contact`)

- Public-facing. Fields: name, email, subject, message. Also displays founder/organizer information.
- On submit, FastAPI sends an email to `ADMIN_EMAIL` via `smtplib` + Gmail App Password.
- Nothing is stored in Google Sheets — email notification only.
- Use cases: request to host a tournament, request to become a user, general inquiry.

---

## Home Page (`/`)

- Public marketing page.
- Content: app story/origin, what the tournaments are, how it works, how to join, highlights from the most recent or current tournament (e.g. current leader or most recent champion).
- Clear CTAs: "View Leaderboard", "View History", "Login".
- Tone matches the brand — fun, characterful, Masters-inspired.

---

## Tournament & Scoring Domain

### How a Tournament Works

1. Global admin creates a tournament (becomes its tournament admin).
2. Tournament admin sets up rounds — each round links a course with a round number and label.
3. Global admin sets pars per hole (SCD, resolved by tournament start_date).
4. Global admin sets player handicaps (SCD, resolved by tournament start_date).
5. Logged-in users browse tournaments and submit a registration (status: `in_review`).
6. Tournament admin reviews and accepts or rejects registrations.
7. When tournament goes `active`, accepted players can submit scores.
8. Players go to "My Registrations" → tap "Add Scores" → select round → enter scores hole by hole.
9. Leaderboard is live throughout.
10. When tournament is `complete`, scores lock for players. Leaderboard is the final result — no separate publish step.
11. Forfeit: tournament admin or player can forfeit a registration at any time (with confirm dialog).

### Score Entry UX (Critical)

- Players are on their phones on a golf course, in sunlight, potentially with poor signal.
- Score entry must be **fast, large-tapped, and forgiving**.
- `ScoreStepper` is a large +/− stepper per hole — no keyboard input for score entry.
- The full scorecard for a round loads in **one API call** — no per-hole requests.
- **Optimistic UI:** display updates immediately, sync to backend in background. Surface a clear non-intrusive error and retry on failure.

### Scoring Display

- **Gross score:** raw strokes
- **Net score:** gross strokes minus handicap (used for leaderboard ranking)
- Color coding relative to par:
  - Under par → Emerald `#079E78`
  - At par → Silver `#E0E1E5`
  - Over par → Red `#CC0131`
- Forfeit players shown on leaderboard, visually marked, sorted to the bottom regardless of score.

---

## Branding

**App Name:** Mini Golf Masters

**Assets:** All brand assets live in `frontend/public/images/`. Reference with `/images/filename`.

**Favicon:** Set in `index.html` as `<link rel="icon" href="/images/favicon.png" />`. Use the circular windmill logo.

**Fonts** (Google Fonts):
- Headers/Display: `League Spartan`
- Body: `Montserrat`

**Color Palette:**

| Name | Hex | Usage |
|---|---|---|
| Forest Green | `#135D40` | Primary — nav, headers, primary buttons |
| Emerald | `#079E78` | Secondary — accents, active states, under-par |
| Silver | `#E0E1E5` | Borders, dividers, at-par |
| Cream | `#F3F4EE` | Page/app background |
| Yellow | `#FBF50D` | Highlights, badges, score callouts |
| Red | `#CC0131` | Errors, over-par, destructive actions |

**Vibe:** Masters-inspired. Clean, sporty, data-forward but fun. Augusta National meets a backyard tournament with friends — characterful and a little playful, not corporate.

**Mobile-first:** All UI designed for phone screens first. Bottom tab navigation. Large tap targets. No hover-dependent interactions for core functionality.

---

## Page Titles

Set via a `usePageTitle` hook or `document.title` in each page component. Format: `{Page} | Mini Golf Masters`.

| Page | Title |
|---|---|
| Home | `Mini Golf Masters` |
| Tournaments | `Tournaments \| Mini Golf Masters` |
| Leaderboard | `Leaderboard \| Mini Golf Masters` |
| History | `History \| Mini Golf Masters` |
| Contact | `Contact \| Mini Golf Masters` |
| Login | `Login \| Mini Golf Masters` |
| Accept Invite | `Create Account \| Mini Golf Masters` |
| Scorecard | `Scorecard \| Mini Golf Masters` |
| Admin Dashboard | `Admin \| Mini Golf Masters` |
| Manage Tournament | `Manage Tournament \| Mini Golf Masters` |
| Manage Courses | `Manage Courses \| Mini Golf Masters` |
| Manage Users | `Manage Users \| Mini Golf Masters` |

---

## Environment Variables

Store in `.env` locally (never commit) and in Render's dashboard for production.

```
# Google Sheets
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=   # Full JSON of service account key

# Auth
JWT_SECRET_KEY=                 # Generate with: openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=72

# Email
ADMIN_EMAIL=                    # Your personal Gmail address
GMAIL_APP_PASSWORD=             # Google Account > Security > App Passwords

# App
ENVIRONMENT=development         # or production
FRONTEND_URL=                   # e.g. https://minigolfmasters.onrender.com
```

Frontend (Vite):
```
VITE_API_URL=                   # e.g. https://minigolfmasters-api.onrender.com
```

---

## Suggested Build Order

Complete and test each phase before moving to the next.

1. **Repo & config setup** — monorepo scaffold, `.env.example`, `render.yaml`, Vite + Tailwind config with brand tokens
2. **Google Sheets setup** — service account, create spreadsheet with all tabs and correct column headers, `sheets.py` with typed helper functions
3. **Auth** — invite flow, bcrypt, JWT, `dependencies.py`, login / accept-invite endpoints
4. **Admin: courses & pars** — create courses and holes; set and update pars (SCD insert logic)
5. **Admin: users & handicaps** — invite users, set roles; set and update handicaps (SCD insert logic)
6. **Admin: tournament setup** — create tournament, manage rounds
7. **Registrations** — player registers; tournament admin accepts / rejects / forfeits (with confirm dialog)
8. **Player: score entry** — Scorecard page, ScoreStepper component, optimistic submission, edit own scores
9. **Leaderboard** — live standings, net score calc, forfeit handling, score lock on complete
10. **History** — all scores, all years, all players
11. **Public pages** — Home (marketing), Contact (form + email)
12. **Polish & deployment** — Render deploy, favicon, page titles, mobile QA, admin score override

---

## Important Conventions

- `sheets.py` is the **only** file that imports or calls the Google Sheets API. All other files call helper functions from `sheets.py`.
- One Pydantic model file per domain entity in `models/`, mirroring the sheet tabs.
- One router file per domain in `routers/`.
- JWT role (`player` or `admin`) is read from the token — never re-fetched from the sheet per request.
- `require_tournament_admin` checks that the authenticated user's `user_id` matches the tournament's `tournament_admin_id`, or that the user is a global admin.
- API responses always return typed Pydantic models — never raw sheet row dicts.
- SCD lookups: always filter `active_from <= tournament.start_date AND active_to >= tournament.start_date`.
- Mobile-first CSS: base styles for small screens, use `md:` and `lg:` Tailwind breakpoints to enhance for larger screens.
- Optimistic UI on score submission — display updates immediately, sync in background, handle failures gracefully.
- All destructive or irreversible actions (forfeit, delete) require a confirmation dialog before proceeding.
