# Tie Playoff Design — Sudden Death

> **Status:** Design doc only. No code implemented. This describes the intended approach for a future feature.

---

## Problem

When a tournament ends with two or more players sharing the same net score, the current codebase has no way to break the tie. The leaderboard shows a shared rank with no winner declared.

---

## Proposed Approach: Sudden Death Playoff

### Concept

After the final round is locked and a tie is detected among players competing for a position (typically 1st), the admin initiates a sudden-death playoff. Players replay a single designated hole in repeated attempts until one player scores strictly better than the other(s) on the same attempt number.

---

## Data Model Changes

### `rounds` table — new `type` column

Add an optional `type` column (string) to `rounds`:

| Value | Meaning |
|---|---|
| `null` / `""` | Normal round (default) |
| `"playoff"` | Sudden death playoff round |

Alternatively, a boolean `is_playoff` column could work — but `type` is more extensible (e.g., future `"practice"` rounds).

### `scores` table — reuse as-is

Playoff scores are stored as normal score records on the playoff `round_id`. The `hole_id` is the designated playoff hole.

To track attempt number (since players may play the same hole multiple times in the same round), add an `attempt` integer column to `scores` (default `1`). Each repeated attempt increments this value.

**Uniqueness constraint change:** The current uniqueness on `(registration_id, round_id, hole_id)` must be relaxed to `(registration_id, round_id, hole_id, attempt)`.

---

## Backend Logic

### Create playoff round

`POST /rounds/` with `type = "playoff"` and `course_id` of the hole being played. This is a normal round creation — no special endpoint needed.

### Determine winner

Winner = the player who, on the **lowest attempt number where scores differ**, has the strictly lower score.

```python
def find_playoff_winner(scores_by_player: dict[str, list[int]]) -> str | None:
    """
    scores_by_player: { user_id: [attempt_1_score, attempt_2_score, ...] }
    Returns user_id of winner, or None if still tied.
    """
    max_attempts = max(len(s) for s in scores_by_player.values())
    for attempt_idx in range(max_attempts):
        attempt_scores = {
            uid: scores[attempt_idx]
            for uid, scores in scores_by_player.items()
            if len(scores) > attempt_idx
        }
        min_score = min(attempt_scores.values())
        winners = [uid for uid, s in attempt_scores.items() if s == min_score]
        if len(winners) == 1:
            return winners[0]
    return None  # Still tied — need another attempt
```

This logic lives in `routers/tournaments.py` (or a new `routers/playoffs.py`) and is called when computing the leaderboard for a tournament with a playoff round.

### Leaderboard impact

When computing the final leaderboard for a completed tournament:
1. Compute net scores as normal.
2. If a playoff round exists and a winner is determined: the playoff winner is ranked above all other players with the same net score.
3. All other tied-but-not-playoff-resolved players retain their shared rank.

---

## Frontend Changes

### ManageTournament — Playoff Tab / Section

After tournament status is `complete` and a tie exists among top players:

1. Admin sees a **"Resolve Tie"** button (only visible when ties exist at rank 1, or at admin's discretion for any tied position).
2. Clicking it opens a dialog or expands a section:
   - Select the playoff hole (course + hole number picker).
   - Choose which players are in the playoff (pre-populated with tied players).
3. Admin clicks **"Start Playoff Round"** → creates a new round with `type = "playoff"`.
4. Admin enters scores for each player's first attempt via the existing score entry UI (AdminRoundScores or an inline mini-grid).
5. If still tied after attempt 1, admin enters attempt 2 scores, and so on.
6. The UI displays the current playoff status: "Tied after attempt 2 — enter attempt 3."
7. Once a winner is found, a **"🏆 Playoff winner: [Name]"** confirmation is shown.

### Leaderboard — Playoff Badge

On the leaderboard, when a playoff round exists and a winner is determined:
- The winner's row shows a **"🏆 playoff"** badge next to their score.
- Other tied players who lost the playoff show a **"playoff"** badge (no trophy) at the same rank.
- Tooltip/expand text: "Won on sudden death, hole X, attempt Y."

---

## Edge Cases

| Case | Handling |
|---|---|
| All tied players score the same on every attempt indefinitely | Admin manually marks a winner via a future admin override field, or the tie stands |
| A playoff player forfeits mid-playoff | Their registration status is updated to `forfeit`; they are removed from the playoff |
| Admin accidentally creates two playoff rounds | UI should warn if a playoff round already exists for the tournament |
| Tournament has ties at positions other than 1st | Admin can initiate a playoff for any tied group — the UI should allow selecting which tied rank to resolve |

---

## Out of Scope (Future)

- Automated tie detection on tournament completion (currently admin-initiated).
- Live playoff scoring (players entering their own scores on their phones during the playoff hole).
- Playoff bracket for 3+ way ties (current design resolves N-way ties in a single sudden-death group).

---

## Current Codebase State

- No `type` column on `rounds`.
- No `attempt` column on `scores`.
- Leaderboard does not distinguish playoff rounds from normal rounds.
- No tie detection logic anywhere.
- No admin UI for playoff management.
