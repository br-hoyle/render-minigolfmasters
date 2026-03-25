import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function History() {
  useEffect(() => {
    document.title = 'History | Mini Golf Masters'
  }, [])

  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/tournaments/').then((ts) => {
      setTournaments(ts.filter((t) => t.status === 'complete'))
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display font-black text-3xl text-forest">History</h1>

      {tournaments.length === 0 && (
        <p className="text-gray-500 text-sm">No completed tournaments yet.</p>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => (
          <a
            key={t.tournament_id}
            href={`/leaderboard/${t.tournament_id}`}
            className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="font-display font-bold text-forest">{t.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {t.start_date} — {t.end_date}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
