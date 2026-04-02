# Mini Golf Masters — Claude Code Project Context

This file provides full context for every Claude Code session. Read it completely before writing any code.

---

## Project Overview

**Mini Golf Masters** is an invite-only, mobile-first web app for managing mini golf tournaments among a small-ish community. It tracks scores hole-by-hole, manages tournament setup, and preserves history.

The app needs to be essentially free to run. It is hosted on Render's free tier using Supabase Free Tier as the database.

---

## Hosting & Infrastructure

- **Repo structure:** Single GitHub monorepo, two Render services defined in `render.yaml` at the repo root
- **Backend:** Render Free Web Service (FastAPI/Python) — root directory `backend/`, spins down after 15 min inactivity, acceptable for this use case
- **Frontend:** Render Static Site (React + Vite) — root directory `frontend/`, always on, free
- **Database:** Supabase (Free Tier)
- **Email:** Python `smtplib` via Gmail App Password (stored as env var). All email flows go through `backend/email_utils.py`. No third-party email service.

---

## File Structure

```
render-minigolfmasters/
│
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Environment variables, settings
│   ├── sheets.py                # Supabase abstraction layer
│   ├── auth.py                  # JWT creation, validation, invite token logic
│   ├── email_utils.py           # Centralized email sender — send_email(to, subject, body, reply_to=None)
│   ├── dependencies.py          # FastAPI dependencies (get_current_user, require_admin, require_tournament_admin)
│   │
│   ├── routers/
│   │   ├── auth.py              # POST /login, POST /accept-invite, POST /reset-password, POST /reset-password-by-token
│   │   ├── users.py             # GET/POST /users, POST /users/invite, PATCH /users/me, GET /users/{id}/championships
│   │   ├── tournaments.py       # GET/POST /tournaments, GET /tournaments/{id}, GET /tournaments/{id}/recap,
│   │   │                        # POST /tournaments/{id}/announce, GET /tournaments/admin/stats
│   │   ├── registrations.py     # GET/POST /registrations, PATCH /registrations/{id}, PATCH /registrations/bulk
│   │   ├── rounds.py            # GET/POST /rounds, PATCH /rounds/{id}/lock
│   │   ├── courses.py           # GET/POST /courses, holes per course, GET /courses/{id}/stats,
│   │   │                        # GET /courses/{id}/analytics (public — full analytics payload)
│   │   ├── pars.py              # GET/POST /pars (resolved by tournament start_date), POST /pars/bulk
│   │   ├── handicaps.py         # GET/POST /handicaps (resolved by tournament start_date)
│   │   ├── handicap_requests.py # POST /handicap-requests/, GET /handicap-requests/me, GET /handicap-requests/,
│   │   │                        # PATCH /handicap-requests/{id}
│   │   ├── scores.py            # GET/POST /scores, PATCH /scores/{id}, GET /scores/{id}/audit
│   │   └── contact.py           # POST /contact
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── tournament.py        # Includes max_players: str, registration_deadline: str
│   │   ├── registration.py
│   │   ├── round.py             # Includes locked: str
│   │   ├── course.py
│   │   ├── hole.py
│   │   ├── score.py             # Includes version: int
│   │   ├── par.py
│   │   ├── handicap.py
│   │   ├── score_audit_log.py   # audit_id, score_id, previous_strokes, new_strokes, modified_by, modified_at
│   │   └── handicap_request.py  # request_id, user_id, requested_strokes, message, status, submitted_at, resolved_at, resolved_by
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
│   │   │   ├── Layout.jsx       # Mobile shell, bottom tab nav, offline sync banner
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── ScoreStepper.jsx # Large +/- tap input for single-hole score entry
│   │   │   ├── ScoreGrid.jsx    # Compact grid mode — all holes at once with inline steppers
│   │   │   ├── Banner.jsx       # Reusable image banner
│   │   │   └── Dialog.jsx       # Reusable modal/dialog
│   │   │
│   │   ├── utils/
│   │   │   └── offlineQueue.js  # localStorage offline score queue (queueScores, syncQueue, etc.)
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Contact.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── AcceptInvite.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Tournaments.jsx
│   │   │   ├── Courses.jsx          # Public course list — links to CourseDetail
│   │   │   ├── CourseDetail.jsx     # Public course detail — name/address/description then analytics inline;
│   │   │   │                        # ?hole=N auto-opens and scrolls to that hole's accordion row
│   │   │   ├── Leaderboards.jsx
│   │   │   ├── Leaderboard.jsx      # Round-by-round tabs, player drill-down, recap link
│   │   │   ├── RoundScores.jsx      # Hole-by-hole table with avg difficulty row
│   │   │   ├── TournamentRecap.jsx  # Champion card, stat cards, copy link
│   │   │   ├── History.jsx          # Completed tournaments with recap links
│   │   │   ├── Registrations.jsx
│   │   │   ├── Scorecard.jsx        # Stepper + grid modes, par badges, confirm, offline, conflict dialog
│   │   │   ├── Profile.jsx          # Phone, password, handicap request, champion badges
│   │   │   └── admin/
│   │   │       ├── Dashboard.jsx            # Stat cards + tournament list
│   │   │       ├── ManageTournament.jsx     # Full tournament admin (rounds, lock, regs, bulk, scores, audit, announce)
│   │   │       ├── ManageCourses.jsx        # Create courses/holes/pars, bulk par dialog, difficulty badges
│   │   │       ├── ManageUsers.jsx          # Invite/deactivate users, roles, handicap request review
│   │   │       └── AdminRoundScores.jsx     # Admin view/override of player scores per round
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
      - key: DATABASE_URL
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

## Database: Supabase

Supabase is the database. The `sheets.py` file is the **only** place in the codebase that knows about Supabase — all routers call `sheets.py` functions, never the database directly.

### Tables

| Tab | Key Columns |
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

### Key Design Notes

- **Pars are slowly-changing dimensions (SCD).** `active_from` is the date the par was set; `active_to` defaults to `9999-12-31`. When a par is updated: set the previous record's `active_to` to today, insert a new record with `active_from` = today. To resolve the correct par for a tournament, filter where `active_from <= tournament.start_date AND active_to >= tournament.start_date`.
- **Handicaps follow the same SCD pattern.**
- **`last_modified_by`** on scores stores the `user_id` of whoever last wrote the score. Used to detect admin overrides.
- **`version`** on scores is an integer starting at 1, incremented on every write. Used for optimistic concurrency conflict detection. If a client submits `expected_version` and it doesn't match, the backend returns a 409 with the current score data.
- **`score_audit_log`** records every admin override with previous value, new value, modified_by, and modified_at. Immutable — never updated, only appended.
- **`handicap_requests`** tracks player requests for handicap review. Status: `pending` → `approved` or `rejected`. Approval runs the same SCD logic as `POST /handicaps/`.
- **`locked`** on rounds is a string `"true"` or `""`. When locked, players cannot submit or edit scores for that round (admins can still override).
- **`max_players`** and **`registration_deadline`** on tournaments are optional strings. If `max_players` is set and the accepted count reaches it, new registrations become `waitlisted`. If `registration_deadline` is set and has passed, new registrations are blocked with a 400.
- **Registration statuses:** `in_review` → `accepted`, `rejected`, or `waitlisted`. Accepted can become `forfeit`. Waitlisted auto-promotes to `in_review` when an accepted registration is rejected or forfeited.
- **Forfeit players** remain on the leaderboard visually marked and sorted to the bottom.
- **User status:** `active` | `inactive`. Inactive users cannot log in.

---

## Authentication & User System

- **Invite-only accounts.** Only global admins can send invites.
- Invite flow: Admin enters name + email + role in ManageUsers → app generates a unique invite token → emails a signup link → user clicks link → sets password → account activated.
- **Password reset flow:** Admin triggers a reset link for a user → user clicks link → sets new password via `POST /auth/reset-password-by-token`.
- Passwords stored as **bcrypt hashes**.
- Sessions use **JWTs** stored client-side (localStorage), sent as Bearer tokens on every API request.
- Role is embedded in the JWT payload: `player` or `admin`.
- `dependencies.py` provides:
  - `get_current_user` — any authenticated user
  - `require_admin` — global admin only
  - `require_tournament_admin` — must be the `tournament_admin_id` for the specific tournament, or a global admin
- **User profile self-service:** Authenticated users can update their own phone number and change their password via `PATCH /users/me`.

---

## Email

All email is sent through `backend/email_utils.py`:

```python
def send_email(to_email: str, subject: str, body: str, reply_to: str | None = None) -> bool
```

Returns `True` on success, `False` on failure (non-blocking). Email flows:
- **Invites** — `users.py` → invite link
- **Password reset** — `auth.py` → reset link
- **Contact form** — `contact.py` → forwarded to `ADMIN_EMAIL` with user's email as `reply_to`
- **Registration status** — `registrations.py` → accepted/rejected notification to player
- **Waitlist promotion** — `registrations.py` → notifies waitlisted player when promoted
- **Handicap approval** — `handicap_requests.py` → notifies player when handicap is updated
- **Handicap request** — `handicap_requests.py` → notifies admin when player submits request
- **Tournament announcements** — `tournaments.py` → bulk email to all accepted registrants

---

## Access Control

| Action | Public | Player | Tournament Admin | Global Admin |
|---|---|---|---|---|
| View home / marketing page | ✅ | ✅ | ✅ | ✅ |
| View all tournaments / leaderboards / history | ✅ | ✅ | ✅ | ✅ |
| View tournament recap page | ✅ | ✅ | ✅ | ✅ |
| View courses list and course analytics | ✅ | ✅ | ✅ | ✅ |
| Submit contact form | ✅ | ✅ | ✅ | ✅ |
| Register for a tournament | ❌ | ✅ | ✅ | ✅ |
| Submit / edit own scores (active, unlocked round) | ❌ | ✅ | ✅ | ✅ |
| Forfeit own registration | ❌ | ✅ | ✅ | ✅ |
| Update own profile, change password | ❌ | ✅ | ✅ | ✅ |
| Request handicap review | ❌ | ✅ | ✅ | ✅ |
| Override any player's scores | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Lock / unlock rounds | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Announce to registrants | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Accept / reject / forfeit registrations | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Bulk accept / reject registrations | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Edit tournament details, manage rounds | ❌ | ❌ | ✅ (own tournament) | ✅ |
| Invite users / set roles | ❌ | ❌ | ❌ | ✅ |
| Create tournaments | ❌ | ❌ | ❌ | ✅ |
| Manage courses, holes, pars | ❌ | ❌ | ❌ | ✅ |
| Set player handicaps / approve requests | ❌ | ❌ | ❌ | ✅ |
| Deactivate / reactivate users | ❌ | ❌ | ❌ | ✅ |
| View admin stats, score audit logs | ❌ | ❌ | ❌ | ✅ |

### Score Submission Rules

- Scores can only be submitted or edited by players when tournament status is `active` AND the round is not `locked`.
- Once a tournament is `complete`, player score submission and editing is locked entirely.
- Only the tournament admin or global admin can modify scores on a completed tournament or a locked round.
- If `expected_version` is provided and doesn't match the current score version, the backend returns a 409 Conflict with the current score data. The frontend presents a "keep mine / use theirs" dialog.

---

## Scorecard (Player Score Entry)

Players are on their phones on a golf course, in sunlight, potentially with poor signal. Design priorities:

- **Full round loads in one API call** — no per-hole network requests
- **Two input modes:**
  - **Stepper mode** (default) — one hole at a time, large `ScoreStepper` component with full-screen +/− buttons
  - **Grid mode** — compact scrollable list of all holes at once (`ScoreGrid` component)
- **Par-relative badge** — Eagle / Birdie / Par / Bogey / Double Bogey shown in real time
- **Confirmation step** — "Review & Complete Round" shows full summary table before final navigation
- **Optimistic UI** — score display updates immediately; sync happens in the background
- **Offline-first** — on network failure, scores are queued in `localStorage` via `offlineQueue.js` and the player advances optimistically. Sync runs on mount and whenever the player goes back online. A banner in `Layout.jsx` signals pending sync.
- **Round lock** — if round is locked, a banner is shown and save is disabled
- **Conflict resolution** — on 409, shows a dialog: "Keep mine" (force-save without version check) or "Use theirs" (update local display to server value)

---

## Leaderboard

- **Overall standings** + **round-by-round tabs** (single round view — selecting a round shows only that round's scores)
- **Player drill-down** — tap any player name to expand a per-round hole-by-hole breakdown with par-relative badges. Holes are fetched from `GET /courses/{course_id}/holes` and cached per course_id.
- **Handicap toggle** — switch between net and gross scores
- **"View Recap →"** link appears for completed tournaments
- Forfeit players marked and sorted to bottom

---

## Tournament Recap Page (`/tournaments/:tournamentId/recap`)

Public. Fetches `GET /tournaments/{tournament_id}/recap` which computes in-memory:
- **Champion** — player with the lowest net score
- **Tightest finish** — stroke gap between 1st and 2nd
- **Hardest hole** — hole with the highest avg_vs_par
- **Best single round** — lowest gross score for any player in any round

"Copy Link" button shares the URL. Linked from Leaderboard (completed tournaments) and History.

---

## Routing

| Path | Access | Component |
|---|---|---|
| `/` | Public | Home |
| `/contact` | Public | Contact |
| `/login` | Public | Login |
| `/accept-invite` | Public | AcceptInvite |
| `/reset-password` | Public | ResetPassword |
| `/tournaments` | Public | Tournaments |
| `/leaderboards` | Public | Leaderboards |
| `/leaderboard/:tournamentId` | Public | Leaderboard |
| `/leaderboard/:tournamentId/round/:roundId` | Public | RoundScores |
| `/tournaments/:tournamentId/recap` | Public | TournamentRecap |
| `/history` | Public | History |
| `/courses` | Public | Courses |
| `/courses/:courseId` | Public | CourseDetail (description + analytics inline, `?hole=N` highlights a hole) |
| `/registrations` | Player | Registrations |
| `/profile` | Player | Profile |
| `/scorecard/:registrationId` | Player | Scorecard (round select) |
| `/scorecard/:registrationId/:roundId` | Player | Scorecard (score entry) |
| `/admin` | Admin | Dashboard |
| `/admin/tournaments/:tournamentId` | Admin | ManageTournament |
| `/admin/tournaments/:tournamentId/rounds/:roundId/scores` | Admin | AdminRoundScores |
| `/admin/courses` | Admin | ManageCourses |
| `/admin/users` | Admin | ManageUsers |

---

## Admin Pages

### Dashboard (`/admin`)
- Stat cards: pending registrations, active tournaments, last score submitted (time ago), pending handicap requests. Data from `GET /tournaments/admin/stats`.
- Quick nav to ManageUsers and ManageCourses.
- Tournament list with search + status filter.

### ManageTournament (`/admin/tournaments/:tournamentId`)
- **Tournament details form:** name, dates, entry fee, max players, registration deadline. Saves via `PATCH /tournaments/{id}`.
- **Rounds tab:** add/remove rounds. **Lock/Unlock** toggle per round (`PATCH /rounds/{id}/lock`). Locked rounds show a "Locked" badge.
- **Registrations tab:** search + filter (All / Pending / Accepted / Waitlisted / Forfeit) + sort (newest/oldest). Bulk selection with checkboxes → "Accept Selected" / "Reject Selected" → confirmation dialog → `PATCH /registrations/bulk`. Individual accept/reject/forfeit buttons.
- **Scores tab:** select player + round → load hole scores with +/− steppers. For any hole with an admin override (`last_modified_by ≠ player`), a ⊙ icon opens the score audit log dialog. Saves via `POST /scores/`.
- **Announce button** in header: opens dialog with subject + message → `POST /tournaments/{id}/announce` → shows "Sent to N players".

### ManageCourses (`/admin/courses`)
- Create / edit / delete courses and holes.
- **Set All Pars** button per course: opens a dialog with par inputs for all holes → `POST /pars/bulk`.
- When expanding a course, course difficulty stats are fetched (`GET /courses/{id}/stats`) and avg strokes shown as a color-coded badge next to each hole.
- Each course card has a **"↗ Public" link** that navigates to `/courses/{course_id}?tab=analytics`.

### ManageUsers (`/admin/users`)
- Invite users, change roles, deactivate/reactivate.
- **Handicap Requests section** below user list: shows pending requests with player name, requested strokes, message, submitted date. Approve/Reject buttons → `PATCH /handicap-requests/{id}`. Resolved requests visible in a collapsible `<details>`.

### Profile (`/profile`)
- View account info, phone (editable), password (changeable).
- **Champion badges** — fetched from `GET /users/{user_id}/championships`, shown as yellow pill badges.
- **Handicap display** with "Request Review" button → dialog (suggested strokes + message) → `POST /handicap-requests/`. If a pending request exists, shows "Review pending" instead.

---

## Page Titles

| Page | Title |
|---|---|
| Home | `Mini Golf Masters` |
| Tournaments | `Tournaments \| Mini Golf Masters` |
| Leaderboards | `Leaderboards \| Mini Golf Masters` |
| Leaderboard | `Leaderboard \| Mini Golf Masters` |
| Round Scores | `Round Scores \| Mini Golf Masters` |
| Tournament Recap | `{Name} Recap \| Mini Golf Masters` |
| History | `History \| Mini Golf Masters` |
| Courses | `Courses \| Mini Golf Masters` |
| Course Detail / Analytics | `{Course Name} \| Mini Golf Masters` |
| Contact | `Contact \| Mini Golf Masters` |
| Login | `Login \| Mini Golf Masters` |
| Accept Invite | `Create Account \| Mini Golf Masters` |
| Reset Password | `Reset Password \| Mini Golf Masters` |
| Registrations | `My Registrations \| Mini Golf Masters` |
| Select Round | `Select Round \| Mini Golf Masters` |
| Scorecard | `Scorecard \| Mini Golf Masters` |
| Profile | `Profile \| Mini Golf Masters` |
| Admin Dashboard | `Admin \| Mini Golf Masters` |
| Manage Tournament | `Manage Tournament \| Mini Golf Masters` |
| Manage Courses | `Manage Courses \| Mini Golf Masters` |
| Manage Users | `Manage Users \| Mini Golf Masters` |
| Admin Round Scores | `Round Scores \| Mini Golf Masters` |

---

## Branding

**App Name:** Mini Golf Masters

**Assets:** All brand assets live in `frontend/public/images/`. Reference with `/images/filename`.

**Favicon:** Set in `index.html` as `<link rel="icon" href="/images/favicon.png" />`.

**Fonts** (Google Fonts):
- Headers/Display: `League Spartan`
- Body: `Montserrat`

**Color Palette:**

| Name | Hex | Tailwind | Usage |
|---|---|---|---|
| Forest Green | `#135D40` | `forest` | Primary — nav, headers, primary buttons |
| Emerald | `#079E78` | `emerald` | Secondary — accents, active states, under-par |
| Silver | `#E0E1E5` | `silver` | Borders, dividers, at-par |
| Cream | `#F3F4EE` | `cream` | Page/app background |
| Yellow | `#FBF50D` | `yellow` | Highlights, badges, score callouts, champion |
| Red | `#CC0131` | — | Errors, over-par, destructive actions |

**Vibe:** Masters-inspired. Clean, sporty, data-forward but fun. Augusta National meets a backyard tournament with friends — characterful and a little playful, not corporate.

**Mobile-first:** All UI designed for phone screens first. Bottom tab navigation. Large tap targets. No hover-dependent interactions for core functionality.

---

## Environment Variables

Store in `.env` locally (never commit) and in Render's dashboard for production.

```
# Supabase
DATABASE_URL=                   # Supabase database URL

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

## Important Conventions

- `sheets.py` is the **only** file that imports or calls the Supabase connection. All other files call helper functions from `sheets.py`.
- `email_utils.py` is the **only** file that sends email. All email flows call `email_utils.send_email()`. It returns `bool` and never raises — email failures are non-blocking.
- One Pydantic model file per domain entity in `models/`, mirroring the sheet tabs.
- One router file per domain in `routers/`.
- JWT role (`player` or `admin`) is read from the token — never re-fetched from the sheet per request.
- `require_tournament_admin` checks that the authenticated user's `user_id` matches the tournament's `tournament_admin_id`, or that the user is a global admin.
- API responses always return typed Pydantic models — never raw sheet row dicts.
- SCD lookups: always filter `active_from <= tournament.start_date AND active_to >= tournament.start_date`.
- Mobile-first CSS: base styles for small screens, use `md:` and `lg:` Tailwind breakpoints to enhance for larger screens.
- Optimistic UI on score submission — display updates immediately, sync in background, handle failures gracefully.
- All destructive or irreversible actions (forfeit, delete, bulk reject) require a confirmation dialog before proceeding.
- Score `version` is incremented on every write in `sheets.py`. If `expected_version` is passed by the client and doesn't match, return 409 with current score data. Never silently overwrite.
- `locked` on a round is stored as the string `"true"` or `""` (empty string). Check with `round.get("locked") == "true"`.
- Registration `status` values: `in_review`, `accepted`, `rejected`, `waitlisted`, `forfeit`.
- Handicap request `status` values: `pending`, `approved`, `rejected`.
