# Mini Golf Masters — Session Memory

## Project Status
- Full file structure scaffolded (March 2026)
- Backend and frontend stubs complete; not yet wired to real Google Sheets or deployed

## Key Architecture
- Backend: FastAPI/Python in `backend/` — `sheets.py` is the ONLY file touching Google Sheets API
- Frontend: React + Vite + Tailwind in `frontend/`
- Database: Google Sheets (service account auth)
- Hosted on Render free tier

## Important File Locations
- `backend/sheets.py` — all Sheets read/write logic
- `backend/dependencies.py` — get_current_user, require_admin, require_tournament_admin
- `frontend/src/api/client.js` — fetch wrapper with JWT Bearer token
- `frontend/src/context/AuthContext.jsx` — auth state, login/logout
- `frontend/src/components/ScoreStepper.jsx` — critical score-entry UI component
- `frontend/tailwind.config.js` — brand color tokens (forest, emerald, silver, cream, yellow, red)

## Next Steps (per CLAUDE.md build order)
1. Google Sheets setup — create spreadsheet with all tabs and column headers
2. Test auth flow end-to-end
3. Wire up admin pages with real data
4. Deploy to Render
