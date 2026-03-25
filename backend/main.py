from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_URL
from routers import auth, users, tournaments, registrations, rounds, courses, pars, handicaps, scores, contact

app = FastAPI(title="Mini Golf Masters API")

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


@app.get("/health")
def health():
    return {"status": "ok"}
