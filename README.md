# ⛳ Mini Golf Masters

Mini Golf Masters is a full-stack tournament management app built for a small community of competitive mini golfers. It handles everything from pre-tournament setup (courses, pars, handicaps, registrations) to live score entry on the course and final leaderboard results — all from a phone.

Built to run for free. Designed to last for years.

---

## Features

- **Tournament management** — create tournaments, set up rounds across multiple courses, manage the field
- **Live score entry** — mobile-optimized scorecard with large tap targets, built for a golf course in sunlight
- **Live leaderboard** — real-time standings with gross and net scores (handicap-adjusted), color-coded by par
- **Score history** — every score, every hole, every player, every year — all public
- **Invite-only accounts** — players are invited by email; no open registration
- **Role-based access** — players, tournament admins, and global admins each have distinct permissions
- **User profiles** — players can update their phone number and change their password from a self-service profile page
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
├── backend/               # FastAPI app
│   ├── main.py
│   ├── config.py
│   ├── sheets.py          # Google Sheets abstraction layer
│   ├── auth.py
│   ├── dependencies.py
│   ├── routers/           # One file per domain (auth, users, tournaments, scores, etc.)
│   ├── models/            # Pydantic models — one file per entity
│   ├── pyproject.toml
│   └── poetry.lock
├── frontend/              # React + Vite app
│   ├── public/
│   │   └── images/        # Brand assets — logo, favicon, photos
│   └── src/
│       ├── api/           # API client (attaches JWT to every request)
│       ├── context/       # Auth context
│       ├── components/    # Layout, ScoreStepper, ProtectedRoute, Banner, Dialog
│       └── pages/         # All pages including admin/ (19 pages total)
├── .env.example
├── render.yaml            # Deploys both services from one repo
└── CLAUDE.md              # Full project context for AI-assisted development
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

Fill in `.env` with your values:

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

Create a new Google Spreadsheet and add the following tabs with these exact column headers:

| Tab | Columns |
|---|---|
| `users` | user_id, first_name, last_name, email, phone, password_hash, invite_token, role, status, created_at |
| `courses` | course_id, name, address, description |
| `holes` | hole_id, course_id, hole_number |
| `pars` | par_id, hole_id, par_strokes, active_from, active_to |
| `handicaps` | handicap_id, user_id, strokes, active_from, active_to |
| `tournaments` | tournament_id, name, start_date, end_date, status, tournament_admin_id |
| `rounds` | round_id, tournament_id, course_id, round_number, label |
| `scores` | score_id, user_id, registration_id, round_id, hole_id, strokes, submitted_at, last_modified_by |
| `registrations` | registration_id, tournament_id, user_id, status, submitted_at |

Share the spreadsheet with your service account email (found in your service account JSON as `client_email`).

### 4. Run the backend

```bash
cd backend
poetry install
poetry run uvicorn main:app --reload
```

API available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

App available at `http://localhost:5173`.

---

## Deployment

This project deploys to [Render](https://render.com) using the `render.yaml` at the repo root. Both services (backend API and frontend static site) deploy from the same GitHub repo.

### Steps

1. Push the repo to GitHub
2. Create a new Render account (free) and connect your GitHub repo
3. Render will detect `render.yaml` and configure both services automatically
4. Add the required environment variables in the Render Dashboard for each service
5. Deploy

The backend will be available at `https://minigolfmasters-api.onrender.com` and the frontend at `https://minigolfmasters.onrender.com` (or your custom domain).

> **Note:** The free backend tier spins down after 15 minutes of inactivity. The first request after a period of inactivity will take ~30 seconds to cold start. This is expected and acceptable for a small-group hobby app.

### Custom Domain (Optional)

The Hobby tier supports up to 2 custom domains. To use your own domain (e.g. `minigolfmasters.com`):

1. Purchase a domain from any registrar (~$10–15/year)
2. In the Render Dashboard, add your domain to each service under Settings → Custom Domains
3. Update your DNS records as instructed by Render
4. Render automatically provisions and renews TLS certificates

---

## User Roles

| Role | Description |
|---|---|
| **Public** | Can view leaderboards, score history, and submit contact forms. No account required. |
| **Player** | Invited users. Can register for tournaments, submit and edit their own scores, and forfeit their own registration. |
| **Tournament Admin** | The global admin who created a specific tournament. Can manage that tournament's rounds, accept/reject/forfeit registrations, and override scores. |
| **Global Admin** | Full access. Invites users, deactivates accounts, creates tournaments, manages courses, pars, and handicaps. |

---

## Score Entry

The scorecard is the core player experience. Key design decisions:

- **One API call** loads the full scorecard for a round — no per-hole network requests
- **Optimistic UI** — scores display immediately on tap, sync in the background
- **Large +/− steppers** — no keyboard input, designed for sunlit phone screens
- **Score lock** — once a tournament is marked `complete`, players cannot edit scores (admin override only)

---

## Data Design Notes

**Google Sheets as a database** works well for this use case: the user base is small, writes are infrequent, and the spreadsheet doubles as a human-readable audit log that organizers can inspect directly.

**Pars and handicaps** are stored as slowly-changing dimensions. When a value changes, the old record gets an `active_to` date and a new record is inserted. The correct value for any tournament is resolved using the tournament's `start_date`.

**`sheets.py`** is the only file in the codebase that knows it's talking to a spreadsheet. All routers call typed helper functions from `sheets.py`. If the database is ever swapped for PostgreSQL or another store, only `sheets.py` needs to change.

---

## Contributing

This is a private hobby project. If you've been invited to contribute, read `CLAUDE.md` first — it contains the full project context, conventions, and build order used for AI-assisted development with Claude Code.
