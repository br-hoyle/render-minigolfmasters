from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import FRONTEND_URL
from routers import auth, users, tournaments, registrations, rounds, courses, pars, handicaps, scores, contact, handicap_requests
from sheets import DatabaseBusyError

app = FastAPI(title="Mini Golf Masters API")


@app.exception_handler(DatabaseBusyError)
def handle_database_busy(request: Request, exc: DatabaseBusyError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Hit max database connections. Please try again later."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(tournaments.router, prefix="/tournaments", tags=["tournaments"])
app.include_router(registrations.router, prefix="/registrations", tags=["registrations"])
app.include_router(rounds.router, prefix="/rounds", tags=["rounds"])
app.include_router(courses.router, prefix="/courses", tags=["courses"])
app.include_router(pars.router, prefix="/pars", tags=["pars"])
app.include_router(handicaps.router, prefix="/handicaps", tags=["handicaps"])
app.include_router(scores.router, prefix="/scores", tags=["scores"])
app.include_router(contact.router, prefix="/contact", tags=["contact"])
app.include_router(handicap_requests.router, prefix="/handicap-requests", tags=["handicap-requests"])


@app.get("/health")
def health():
    return {"status": "ok"}
