"""
Mini Golf Masters — tournament concurrency load test.

Simulates 10-25 players entering scores and checking the leaderboard at the
same time, on phones with spotty signal, and measures what the audit in
docs/tournament-concurrency-plan found: false 409 conflicts, slow leaderboard
reads, and dropped/overwritten scores.

!!! NEVER RUN THIS AGAINST PRODUCTION DATA !!!

Run it against a throwaway Supabase project (Supabase's free tier allows two
projects), seeded with a copy of the schema plus test users, a test course,
and a test tournament with one active, unlocked round. Point a local or
second Render backend at that project and pass its URL as --api-url.

Usage:
    python scripts/loadtest.py \\
        --api-url http://localhost:8000 \\
        --players players.json \\
        --tournament-id <test-tournament-id> \\
        --num-players 25 \\
        --tee-time

players.json is a list of either:
    {"email": "...", "password": "..."}
or, to skip the registration lookup:
    {"email": "...", "password": "...", "registration_id": "...", "round_id": "..."}

Config can also come from env vars: LOADTEST_API_URL, LOADTEST_PLAYERS_FILE,
LOADTEST_TOURNAMENT_ID.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import statistics
import sys
import time
import uuid
from dataclasses import dataclass, field

import httpx

DEFAULT_TIMEOUT = 20.0


@dataclass
class EndpointStats:
    latencies_ms: list[float] = field(default_factory=list)
    status_counts: dict[int, int] = field(default_factory=dict)
    errors: int = 0

    def record(self, elapsed_ms: float, status_code: int | None) -> None:
        self.latencies_ms.append(elapsed_ms)
        if status_code is None:
            self.errors += 1
        else:
            self.status_counts[status_code] = self.status_counts.get(status_code, 0) + 1

    def summary(self) -> dict:
        if not self.latencies_ms:
            return {"count": 0}
        sorted_lat = sorted(self.latencies_ms)
        return {
            "count": len(sorted_lat),
            "p50_ms": round(_percentile(sorted_lat, 50), 1),
            "p95_ms": round(_percentile(sorted_lat, 95), 1),
            "max_ms": round(sorted_lat[-1], 1),
            "status_counts": self.status_counts,
            "network_errors": self.errors,
        }


def _percentile(sorted_values: list[float], pct: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * (pct / 100)
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)


class Metrics:
    """Thread-unsafe but coroutine-safe (single event loop) stats collector."""

    def __init__(self) -> None:
        self._by_endpoint: dict[str, EndpointStats] = {}

    def record(self, endpoint: str, elapsed_ms: float, status_code: int | None) -> None:
        self._by_endpoint.setdefault(endpoint, EndpointStats()).record(elapsed_ms, status_code)

    def report(self) -> dict:
        return {name: stats.summary() for name, stats in sorted(self._by_endpoint.items())}


class ApiClient:
    """Thin httpx wrapper that times every call and records it under a label."""

    def __init__(self, base_url: str, metrics: Metrics, timeout: float = DEFAULT_TIMEOUT):
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)
        self._metrics = metrics
        self.token: str | None = None

    async def aclose(self) -> None:
        await self._client.aclose()

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    async def call(self, label: str, method: str, path: str, **kwargs) -> httpx.Response | None:
        start = time.perf_counter()
        status_code = None
        try:
            resp = await self._client.request(method, path, headers=self._headers(), **kwargs)
            status_code = resp.status_code
            return resp
        except httpx.HTTPError:
            return None
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self._metrics.record(label, elapsed_ms, status_code)

    async def get(self, label: str, path: str) -> httpx.Response | None:
        return await self.call(label, "GET", path)

    async def post(self, label: str, path: str, json_body: dict) -> httpx.Response | None:
        return await self.call(label, "POST", path, json=json_body)


@dataclass
class PlayerResult:
    email: str
    login_ms: float | None = None
    error: str | None = None
    # hole_id -> last strokes value this player attempted to persist (after
    # queue/retry resolution, the strokes we expect to find in the DB).
    final_values: dict[str, int] = field(default_factory=dict)


async def run_player(
    player_cfg: dict,
    tournament_id: str,
    metrics: Metrics,
    api_url: str,
    tee_time_barrier: asyncio.Barrier | None,
    compression: float,
    results: list[PlayerResult],
) -> None:
    email = player_cfg["email"]
    result = PlayerResult(email=email)
    results.append(result)

    client = ApiClient(api_url, metrics)
    try:
        # --- Login (timed separately from the rest) ---
        start = time.perf_counter()
        resp = await client.call(
            "login", "POST", "/auth/login",
            json={"email": email, "password": player_cfg["password"]},
        )
        result.login_ms = (time.perf_counter() - start) * 1000
        if resp is None or resp.status_code != 200:
            result.error = f"login failed: {resp.status_code if resp else 'network error'}"
            return
        client.token = resp.json()["access_token"]

        if tee_time_barrier is not None:
            await tee_time_barrier.wait()

        # --- Resolve registration + round, exactly as Scorecard.jsx loads ---
        registration_id = player_cfg.get("registration_id")
        if not registration_id:
            regs_resp = await client.get("registrations_mine", "/registrations/")
            if regs_resp is None or regs_resp.status_code != 200:
                result.error = "could not load registrations"
                return
            mine = [r for r in regs_resp.json() if r["tournament_id"] == tournament_id]
            if not mine:
                result.error = "no registration for tournament"
                return
            registration_id = mine[0]["registration_id"]

        reg_resp = await client.get("registrations_by_id", f"/registrations/{registration_id}")
        if reg_resp is None or reg_resp.status_code != 200:
            result.error = "could not load registration"
            return
        reg = reg_resp.json()
        tid = reg["tournament_id"]

        tournament_resp, rounds_resp, scores_resp = await asyncio.gather(
            client.get("tournaments_by_id", f"/tournaments/{tid}"),
            client.get("rounds_by_tournament", f"/rounds/?tournament_id={tid}"),
            client.get("scores_by_registration", f"/scores/?registration_id={registration_id}"),
        )
        if any(r is None or r.status_code != 200 for r in (tournament_resp, rounds_resp, scores_resp)):
            result.error = "could not load scorecard bundle"
            return
        tournament = tournament_resp.json()
        rounds = sorted(rounds_resp.json(), key=lambda r: r["round_number"])
        existing_scores = scores_resp.json()

        round_id = player_cfg.get("round_id") or (rounds[0]["round_id"] if rounds else None)
        round_data = next((r for r in rounds if r["round_id"] == round_id), None)
        if not round_data:
            result.error = "no round to score"
            return

        holes_resp, pars_resp = await asyncio.gather(
            client.get("course_holes", f"/courses/{round_data['course_id']}/holes"),
            client.get("pars_for_date", f"/pars/?tournament_start_date={tournament['start_date']}"),
        )
        if holes_resp is None or holes_resp.status_code != 200:
            result.error = "could not load holes"
            return
        holes = sorted(holes_resp.json(), key=lambda h: h["hole_number"])
        pars = pars_resp.json() if pars_resp and pars_resp.status_code == 200 else []
        par_map = {p["hole_id"]: int(p["par_strokes"]) for p in pars}

        version_map = {
            s["hole_id"]: int(s.get("version") or 1)
            for s in existing_scores
            if s["round_id"] == round_id
        }

        # --- Score 18 (or however many) holes, one save per hole ---
        holes_scored: list[str] = []
        for i, hole in enumerate(holes):
            hole_id = hole["hole_id"]
            strokes = random.randint(
                max(1, par_map.get(hole_id, 3) - 1), par_map.get(hole_id, 3) + 3
            )
            await asyncio.sleep(random.uniform(20, 90) * compression)

            new_version = await _save_hole(
                client, registration_id, round_id, hole_id, strokes,
                version_map.get(hole_id), "score_save",
            )
            if new_version is not None:
                version_map[hole_id] = new_version
                result.final_values[hole_id] = strokes
            holes_scored.append(hole_id)

            # Re-edit ~10% of already-scored holes
            if len(holes_scored) > 1 and random.random() < 0.10:
                redo_hole = random.choice(holes_scored[:-1])
                redo_strokes = random.randint(1, 10)
                await asyncio.sleep(random.uniform(1, 5) * compression)
                new_version = await _save_hole(
                    client, registration_id, round_id, redo_hole, redo_strokes,
                    version_map.get(redo_hole), "score_resave",
                )
                if new_version is not None:
                    version_map[redo_hole] = new_version
                    result.final_values[redo_hole] = redo_strokes

            # Check the leaderboard every 2-4 holes, like a player comparing
            # standings between holes.
            if (i + 1) % random.randint(2, 4) == 0:
                await asyncio.gather(
                    client.get("leaderboard_scores", "/scores/"),
                    client.get("leaderboard_registrations", f"/registrations/?tournament_id={tid}"),
                    client.get("leaderboard_users", "/users/public"),
                    client.get("leaderboard_rounds", f"/rounds/?tournament_id={tid}"),
                    client.get("leaderboard_pars", "/pars/"),
                    client.get("leaderboard_handicaps", "/handicaps/"),
                )

        # --- Complete Round ---
        await client.post(
            "complete_round",
            "/scores/",
            {
                "scores": [
                    {
                        "registration_id": registration_id,
                        "round_id": round_id,
                        "hole_id": hid,
                        "strokes": result.final_values[hid],
                        "expected_version": version_map.get(hid),
                    }
                    for hid in holes_scored
                    if hid in result.final_values
                ]
            },
        )
    finally:
        await client.aclose()


async def _save_hole(
    client: ApiClient,
    registration_id: str,
    round_id: str,
    hole_id: str,
    strokes: int,
    expected_version: int | None,
    label: str,
) -> int | None:
    """POST one hole's score. Returns the new version on success, else None."""
    resp = await client.post(
        label,
        "/scores/",
        {
            "scores": [
                {
                    "registration_id": registration_id,
                    "round_id": round_id,
                    "hole_id": hole_id,
                    "strokes": strokes,
                    "expected_version": expected_version,
                }
            ]
        },
    )
    if resp is None:
        return None
    if resp.status_code == 201:
        body = resp.json()
        scores = body.get("scores") or []
        if scores:
            return int(scores[0]["version"])
        return (expected_version or 1) + 1
    if resp.status_code == 409:
        # A real client would open the conflict dialog here; for the load
        # test we just note the conflict happened (see status_counts) and
        # give up on this hole for the integrity check.
        return None
    return None


async def verify_integrity(api_url: str, tournament_id: str, round_id: str, results: list[PlayerResult]) -> dict:
    """Confirm every hole's DB value equals the last value that player sent."""
    client = ApiClient(api_url, Metrics())
    mismatches = []
    try:
        for result in results:
            if result.error or not result.final_values:
                continue
            # Re-login is unnecessary for reads — scores are joined by
            # registration_id, which is public info on the leaderboard route.
            resp = await client.get(
                "verify", f"/scores/?round_id={round_id}"
            )
            if resp is None or resp.status_code != 200:
                mismatches.append({"player": result.email, "reason": "could not fetch scores for verification"})
                continue
            by_hole = {s["hole_id"]: s for s in resp.json()}
            for hole_id, expected_strokes in result.final_values.items():
                actual = by_hole.get(hole_id)
                if actual is None or int(actual["strokes"]) != expected_strokes:
                    mismatches.append({
                        "player": result.email,
                        "hole_id": hole_id,
                        "expected": expected_strokes,
                        "actual": actual["strokes"] if actual else None,
                    })
    finally:
        await client.aclose()
    return {"checked_players": len(results), "mismatches": mismatches}


async def main_async(args: argparse.Namespace) -> None:
    with open(args.players) as f:
        all_players = json.load(f)
    players = all_players[: args.num_players]
    if len(players) < args.num_players:
        print(
            f"warning: players file has only {len(players)} entries, "
            f"requested {args.num_players}",
            file=sys.stderr,
        )

    metrics = Metrics()
    results: list[PlayerResult] = []
    tee_barrier = asyncio.Barrier(len(players)) if args.tee_time else None

    overall_start = time.perf_counter()
    await asyncio.gather(*[
        run_player(p, args.tournament_id, metrics, args.api_url, tee_barrier, args.compression, results)
        for p in players
    ])
    overall_elapsed = time.perf_counter() - overall_start

    round_id = next((p.get("round_id") for p in players if p.get("round_id")), None)
    integrity = None
    if round_id:
        integrity = await verify_integrity(args.api_url, args.tournament_id, round_id, results)

    report = {
        "config": {
            "api_url": args.api_url,
            "tournament_id": args.tournament_id,
            "num_players": len(players),
            "tee_time": args.tee_time,
            "compression": args.compression,
        },
        "wall_clock_seconds": round(overall_elapsed, 1),
        "endpoints": metrics.report(),
        "player_errors": [
            {"email": r.email, "error": r.error} for r in results if r.error
        ],
        "integrity_check": integrity,
    }

    print(json.dumps(report, indent=2))
    if args.output:
        with open(args.output, "w") as f:
            json.dump(report, f, indent=2)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", default=os.environ.get("LOADTEST_API_URL", "http://localhost:8000"))
    parser.add_argument("--players", default=os.environ.get("LOADTEST_PLAYERS_FILE", "players.json"))
    parser.add_argument("--tournament-id", default=os.environ.get("LOADTEST_TOURNAMENT_ID"))
    parser.add_argument("--num-players", type=int, default=25)
    parser.add_argument(
        "--compression", type=float, default=0.05,
        help="multiply the think-time delays by this factor to compress real-world pacing into a short run",
    )
    parser.add_argument(
        "--tee-time", action="store_true",
        help="all players start scoring at the same instant instead of staggered",
    )
    parser.add_argument("--output", default=None, help="path to also write the JSON report to")
    args = parser.parse_args(argv)
    if not args.tournament_id:
        parser.error("--tournament-id is required (or set LOADTEST_TOURNAMENT_ID)")
    return args


def main() -> None:
    args = parse_args()
    if "localhost" not in args.api_url and "127.0.0.1" not in args.api_url:
        print(
            "This hits a non-localhost API URL. Make sure it points at a "
            "throwaway test environment/test Supabase project — never "
            "production. Ctrl-C now to abort.",
            file=sys.stderr,
        )
        time.sleep(5)
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
