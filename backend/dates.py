"""
Date helpers that think in the tournament's local timezone.

The server runs in UTC. A tournament day, a registration deadline, and "the
day a par or handicap was set" are all local-calendar concepts, so comparing
them against the UTC date is wrong for the last six hours of every Central
evening. Everything that needs "today" or "which day was this timestamp"
goes through here.

Set TOURNAMENT_TIMEZONE (an IANA name, e.g. America/New_York) to change it.
"""

import os
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    TOURNAMENT_TZ = ZoneInfo(os.environ.get("TOURNAMENT_TIMEZONE", "America/Chicago"))
except Exception:  # no tz database on the host — fall back to fixed US Central
    TOURNAMENT_TZ = timezone(timedelta(hours=-6))


def today_local() -> str:
    """Today's date where tournaments are played, as YYYY-MM-DD."""
    return datetime.now(TOURNAMENT_TZ).date().isoformat()


def local_date(value) -> str:
    """The local calendar date (YYYY-MM-DD) of a date or ISO timestamp string.

    Plain dates pass through. Timestamps are converted to the tournament
    timezone first (a naive timestamp is taken to be UTC, which is how the
    app writes them). Returns "" for an empty value.
    """
    s = str(value or "")
    if len(s) <= 10:
        return s
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TOURNAMENT_TZ).date().isoformat()
    except (ValueError, OverflowError):
        return s[:10]
