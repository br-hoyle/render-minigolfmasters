# ⛳ Mini Golf Masters

Mini Golf Masters is a full-stack tournament management app built for a small community of competitive mini golfers. It handles everything from pre-tournament setup (courses, pars, handicaps, registrations) to live score entry on the course and final leaderboard results — all from a phone.

Built to run for free. Designed to last for years.

---

## Features

### Scoring & Gameplay
- **Mobile-optimized scorecard** — large +/− steppers, no keyboard input, built for sunlit phone screens
- **Grid mode** — submit all holes at once from a compact scrollable list
- **Par-relative badges** — Eagle, Birdie, Par, Bogey, Double Bogey displayed in real time as you score
- **Score confirmation** — review your full round before final submission
- **Offline-first scoring** — scores queue to localStorage when offline and sync automatically on reconnect
- **Round locking** — admins can lock a round to prevent further player edits
- **Conflict resolution** — 409 responses surface a "keep mine / use theirs" dialog when concurrent edits collide

### Leaderboard & History
- **Live leaderboard** — real-time gross and net scores (handicap-adjusted), color-coded by par
- **Round-by-round standings** — tab bar filters the leaderboard cumulatively through any round
- **Player drill-down** — tap any player's name to expand their hole-by-hole scorecard per round
- **Score history** — every score, every hole, every player, every year — all public
- **Tournament recap page** — champion, tightest finish, hardest hole, best single round, shareable link
- **Course difficulty analysis** — avg strokes per hole shown in the round scores view and admin course management

### Registration & Communication
- **Tournament registration** — players register from My Registrations; admins accept/reject/forfeit
- **Player cap + waitlist** — tournaments can set `max_players`; overflow registrations become `waitlisted` and auto-promote on vacancy
- **Registration deadline** — admins can set a cutoff date; late registrations are blocked at the API level
- **Acceptance/rejection emails** — players are notified by email when their registration status changes
- **Tournament announcements** — admins can email all accepted registrants at once from the admin panel

### Admin & Tournament Management
- **Tournament creation** — set name, dates, entry fee, max players, and registration deadline
- **Bulk registration actions** — select multiple registrations and accept/reject in one step
- **Registration sorting** — sort pending registrations by newest or oldest submitted
- **Score audit log** — tracks admin overrides with previous value, new value, modifier, and timestamp
- **Bulk par entry** — set all hole pars for a course at once via a grid dialog
- **Admin stats dashboard** — at-a-glance counts for pending registrations, active tournaments, last score time, and pending handicap requests

### Handicap System
- **Handicap requests** — players can request a handicap review with a suggested stroke count and message
- **Admin approval** — admins approve or reject requests from the Manage Users page; approval runs the SCD logic automatically
- **Champion badges** — completed tournament wins shown on the player's profile page

### Infrastructure & Reliability
- **Centralized email utility** — single `email_utils.send_email()` used across all email-sending flows
- **Score versioning** — scores carry a version field for optimistic concurrency conflict detection
- **Score audit log** — immutable record of every admin override
- **Invite-only accounts** — players are invited by email; no open registration
- **Role-based access** — players, tournament admins, and global admins each have distinct permissions
- **User profiles** — players can update their phone number and change their password
- **Contact form** — public inquiry form delivered directly to organizers by email

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, Tailwind CSS |
| Backend | Python, FastAPI |
| Database | Google Sheets (via Google Sheets API) |
| Auth | JWT (bcrypt passwords, invite-token flow) |
| Email | Python `smtplib` + Gmail App Password |
| Hosting | Render (free tier) — Static Site + Web Service |

---

## Project Structure

```
render-minigolfmasters/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Environment variables
│   ├── sheets.py                # Google Sheets abstraction (only file touching the Sheets API)
│   ├── auth.py                  # JWT + invite token logic
│   ├── email_utils.py           # Centralized email sender (smtplib + Gmail App Password)
│   ├── dependencies.py          # FastAPI dependencies (get_current_user, require_admin, etc.)
│   ├── routers/
│   │   ├── auth.py              # Login, accept-invite, reset-password
│   │   ├── users.py             # Users, invites, championships
│   │   ├── tournaments.py       # Tournaments, recap, announce, admin stats
│   │   ├── registrations.py     # Registrations, waitlist, bulk actions
│   │   ├── rounds.py            # Rounds, lock/unlock
│   │   ├── courses.py           # Courses, holes, difficulty stats
│   │   ├── pars.py              # Pars (SCD), bulk par entry
│   │   ├── handicaps.py         # Handicaps (SCD)
│   │   ├── handicap_requests.py # Player handicap review requests
│   │   ├── scores.py            # Score submission, audit log, version conflict
│   │   └── contact.py           # Contact form email
│   ├── models/                  # Pydantic models — one file per entity
│   │   ├── tournament.py        # Includes max_players, registration_deadline
│   │   ├── round.py             # Includes locked field
│   │   ├── score.py             # Includes version field
│   │   ├── score_audit_log.py
│   │   └── handicap_request.py
│   ├── pyproject.toml
│   └── poetry.lock
├── frontend/
│   ├── public/images/           # Brand assets — logo, favicon, photos
│   └── src/
│       ├── api/                 # Fetch wrapper, attaches JWT to every request
│       ├── context/             # Auth context
│       ├── components/
│       │   ├── Layout.jsx       # Mobile shell, header, footer, offline sync banner
│       │   ├── ScoreStepper.jsx # Large +/− tap input for single-hole scoring
│       │   ├── ScoreGrid.jsx    # Compact grid mode — all holes at once
│       │   ├── ProtectedRoute.jsx
│       │   ├── Banner.jsx
│       │   └── Dialog.jsx
│       ├── utils/
│       │   └── offlineQueue.js  # localStorage offline score queue + sync utility
│       └── pages/
│           ├── Home.jsx
│           ├── Contact.jsx
│           ├── Login.jsx
│           ├── AcceptInvite.jsx
│           ├── ResetPassword.jsx
│           ├── Tournaments.jsx
│           ├── Leaderboards.jsx
│           ├── Leaderboard.jsx  # Round tabs, player drill-down
│           ├── RoundScores.jsx  # Hole-by-hole + avg difficulty row
│           ├── TournamentRecap.jsx # Champion, stats, shareable link
│           ├── History.jsx      # Completed tournaments + recap links
│           ├── Registrations.jsx
│           ├── Scorecard.jsx    # Grid/stepper mode, badges, confirm, offline, conflict
│           ├── Profile.jsx      # Handicap request, champion badges
│           └── admin/
│               ├── Dashboard.jsx          # Stat cards, tournament list
│               ├── ManageTournament.jsx   # Full tournament admin
│               ├── ManageCourses.jsx      # Bulk par entry, difficulty badges
│               ├── ManageUsers.jsx        # Invite, roles, handicap requests
│               └── AdminRoundScores.jsx
├── .env.example
├── render.yaml
└── CLAUDE.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Google Cloud project with the Sheets API enabled
- A Google Sheets spreadsheet set up as the database (see below)
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) configured

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/render-minigolfmasters.git
cd render-minigolfmasters
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```
GOOGLE_SHEET_ID=               # From the Google Sheets URL
GOOGLE_SERVICE_ACCOUNT_JSON=   # Full JSON of your service account key
JWT_SECRET_KEY=                 # Generate: openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=72
ADMIN_EMAIL=                    # Your Gmail address
GMAIL_APP_PASSWORD=             # Your Gmail App Password
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

Frontend `.env` (in `frontend/`):

```
VITE_API_URL=http://localhost:8000
```

### 3. Set up the Google Sheet

Create a new Google Spreadsheet and add tabs with these exact column headers:

| Tab | Columns |
|---|---|
| `users` | user_id, first_name, last_name, email, phone, password_hash, invite_token, role, status, created_at |
| `courses` | course_id, name, address, description |
| `holes` | hole_id, course_id, hole_number |
| `pars` | par_id, hole_id, par_strokes, active_from, active_to |
| `handicaps` | handicap_id, user_id, strokes, active_from, active_to |
| `tournaments` | tournament_id, name, start_date, end_date, status, tournament_admin_id, entry_fee, max_players, registration_deadline |
| `rounds` | round_id, tournament_id, course_id, round_number, label, locked |
| `scores` | score_id, user_id, registration_id, round_id, hole_id, strokes, submitted_at, last_modified_by, version |
| `registrations` | registration_id, tournament_id, user_id, status, submitted_at |
| `score_audit_log` | audit_id, score_id, previous_strokes, new_strokes, modified_by, modified_at |
| `handicap_requests` | request_id, user_id, requested_strokes, message, status, submitted_at, resolved_at, resolved_by |

Share the spreadsheet with your service account email (found in `client_email` in the service account JSON).

> For existing deployments, add the new columns to existing tabs manually: `max_players` and `registration_deadline` to `tournaments`; `locked` to `rounds`; `version` to `scores` (set existing rows to `1`). Then create the two new tabs.

### 4. Run the backend

```bash
cd backend
poetry install
poetry run uvicorn main:app --reload
```

API at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

App at `http://localhost:5173`.

---

## Deployment

This project deploys to [Render](https://render.com) using `render.yaml` at the repo root. Both services deploy from the same GitHub repo automatically.

1. Push to GitHub
2. Connect repo to Render — it will detect `render.yaml` and configure both services
3. Add environment variables in the Render Dashboard
4. Deploy

> **Note:** The free backend tier spins down after 15 minutes of inactivity. The first request after a cold start takes ~30 seconds. Expected and acceptable for a hobby app.

---

## User Roles

| Role | Description |
|---|---|
| **Public** | View leaderboards, score history, recap pages, tournament info. No account required. |
| **Player** | Invited users. Register for tournaments, submit/edit scores, request handicap reviews, view champion badges. |
| **Tournament Admin** | The global admin who created a tournament. Manages rounds, registrations, scores, round locks, and announcements for their tournament. |
| **Global Admin** | Full access. Invites users, manages courses/pars/handicaps, creates tournaments, approves handicap requests. |

---

## Score Entry

The scorecard is the core player experience. Key design decisions:

- **One API call** loads the full scorecard for a round — no per-hole network requests
- **Optimistic UI** — scores display immediately on tap, sync in the background
- **Two modes** — stepper (one hole at a time, large tap target) and grid (all holes, compact)
- **Offline-first** — if the network is unavailable, scores are queued in localStorage and synced automatically on reconnect. A banner in the app header signals pending sync.
- **Score lock** — once a tournament is `complete`, players cannot edit scores (admin override only). Rounds can also be individually locked by admins.
- **Version conflict** — if two sessions submit conflicting scores, a "keep mine / use theirs" dialog resolves the conflict instead of silently overwriting.

---

## Data Design Notes

**Google Sheets as a database** works well for this use case: the user base is small, writes are infrequent, and the spreadsheet doubles as a human-readable audit log organizers can inspect directly.

**Pars and handicaps** are stored as slowly-changing dimensions (SCD). When a value changes, the old record gets an `active_to` date and a new record is inserted. The correct value for any tournament is resolved using the tournament's `start_date`.

**`sheets.py`** is the only file in the codebase that knows it's talking to a spreadsheet. All routers call typed helper functions from `sheets.py`. If the database is ever swapped for PostgreSQL, only `sheets.py` needs to change.

**`email_utils.py`** is the only file that sends email. All email flows (invites, password resets, registration status, handicap approval, announcements) call `email_utils.send_email()`. Email failures are non-blocking — the operation completes even if the email bounces.

---

## Contributing

This is a private hobby project. If you've been invited to contribute, read `CLAUDE.md` first — it contains the full project context, conventions, and build order used for AI-assisted development with Claude Code.
