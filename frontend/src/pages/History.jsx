import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'

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

  if (loading) return <LoadingOverlay />

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display font-black text-3xl text-forest">History</h1>

      {tournaments.length === 0 && (
        <p className="text-gray-500 text-sm">No completed tournaments yet.</p>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => (
          <div
            key={t.tournament_id}
            className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <Link to={`/leaderboard/${t.tournament_id}`} className="flex-1 min-w-0">
                <p className="font-display font-bold text-forest">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t.start_date} — {t.end_date}
                </p>
              </Link>
              <Link
                to={`/tournaments/${t.tournament_id}/recap`}
                className="text-xs font-bold text-[#135D40] border border-[#135D40] px-3 py-1 rounded-full hover:bg-forest hover:text-white transition-colors shrink-0"
              >
                Recap →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
