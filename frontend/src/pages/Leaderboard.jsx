import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'

export default function Leaderboard() {
  useEffect(() => {
    document.title = 'Leaderboard | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [tournament, registrations, scores, users, rounds, pars, handicaps] =
          await Promise.all([
            api.get(`/tournaments/${tournamentId}`),
            api.get(`/registrations/?tournament_id=${tournamentId}`),
            api.get(`/scores/?`),
            api.get('/users/'),
            api.get(`/rounds/?tournament_id=${tournamentId}`),
            api.get(`/pars/`),
            api.get('/handicaps/'),
          ])
        setData({ tournament, registrations, scores, users, rounds, pars, handicaps })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!data) return null

  const { tournament, registrations, scores, users, rounds, pars, handicaps } = data

  // Build leaderboard rows
  const accepted = registrations.filter((r) => r.status === 'accepted' || r.status === 'forfeit')

  const rows = accepted.map((reg) => {
    const user = users.find((u) => u.user_id === reg.user_id) || {}
    const handicap = handicaps.find(
      (h) =>
        h.user_id === reg.user_id &&
        h.active_from <= tournament.start_date &&
        h.active_to >= tournament.start_date
    )
    const playerScores = scores.filter((s) => s.registration_id === reg.registration_id)
    const gross = playerScores.reduce((sum, s) => sum + (s.strokes || 0), 0)
    const net = gross - (handicap?.strokes || 0)
    return {
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      gross,
      net,
      forfeit: reg.status === 'forfeit',
      holesPlayed: playerScores.length,
    }
  })

  // Forfeits go last, rest sorted by net
  rows.sort((a, b) => {
    if (a.forfeit !== b.forfeit) return a.forfeit ? 1 : -1
    return a.net - b.net
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display font-black text-3xl text-forest">{tournament.name}</h1>
        <p className="text-sm text-gray-400">Leaderboard</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-forest text-white">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Player</th>
              <th className="text-right px-3 py-2 font-semibold">Gross</th>
              <th className="text-right px-4 py-2 font-semibold">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-6 text-gray-400">
                  No scores yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-t border-silver ${row.forfeit ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3">
                  <span className="font-medium">{row.name}</span>
                  {row.forfeit && (
                    <span className="ml-2 text-xs text-[#CC0131] font-semibold">FORFEIT</span>
                  )}
                </td>
                <td className="text-right px-3 py-3 text-gray-500">{row.gross || '—'}</td>
                <td className="text-right px-4 py-3 font-bold text-forest">{row.net || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
