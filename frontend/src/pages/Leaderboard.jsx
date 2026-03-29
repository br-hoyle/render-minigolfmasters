import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Leaderboard() {
  useEffect(() => {
    document.title = 'Leaderboard | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [leaderboardOpen, setLeaderboardOpen] = useState(true)
  const [handicapOn, setHandicapOn] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [tournament, registrations, scores, users, rounds, pars, handicaps] =
          await Promise.all([
            api.get(`/tournaments/${tournamentId}`),
            api.get(`/registrations/?tournament_id=${tournamentId}`),
            api.get(`/scores/?`),
            api.get('/users/public'),
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

  // Determine if current user has an accepted registration and tournament is active
  const myReg = user
    ? registrations.find(
        (r) =>
          r.user_id === user.user_id &&
          r.status !== 'forfeit' &&
          r.status !== 'rejected'
      )
    : null
  const canAddScores =
    !!myReg &&
    tournament.status === 'active' &&
    (myReg.status === 'accepted' || user?.role === 'admin')

  // Build leaderboard rows
  const accepted = registrations.filter((r) => r.status === 'accepted' || r.status === 'forfeit')

  let activePars = pars.filter(
    (p) =>
      p.active_from.slice(0, 10) <= tournament.start_date &&
      p.active_to.slice(0, 10) >= tournament.start_date
  )
  if (activePars.length === 0) {
    activePars = pars.filter((p) => String(p.active_to).slice(0, 10) === '9999-12-31')
  }
  const totalPar = activePars.reduce((sum, p) => sum + (Number(p.par_strokes) || 0), 0)

  const rows = accepted.map((reg) => {
    const u = users.find((u) => u.user_id === reg.user_id) || {}
    const handicap = handicaps.find(
      (h) =>
        h.user_id === reg.user_id &&
        h.active_from.slice(0, 10) <= tournament.start_date &&
        h.active_to.slice(0, 10) >= tournament.start_date
    )
    const playerScores = scores.filter((s) => s.registration_id === reg.registration_id)
    const gross = playerScores.reduce((sum, s) => sum + (Number(s.strokes) || 0), 0)
    const net = gross - (Number(handicap?.strokes) || 0)
    const displayScore = handicapOn ? net : gross
    const vsParValue = totalPar > 0 ? displayScore - totalPar : null
    return {
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      gross,
      net,
      displayScore,
      vsParValue,
      forfeit: reg.status === 'forfeit',
      holesPlayed: playerScores.length,
    }
  })

  rows.sort((a, b) => {
    if (a.forfeit !== b.forfeit) return a.forfeit ? 1 : -1
    return a.displayScore - b.displayScore
  })

  // Color coding per mockup:
  // negative (under par) = bg-[#CC0131] text-white (red)
  // zero (at par) = bg-silver text-gray-700
  // positive (over par) = bg-forest text-white
  function badgeClass(vsParValue) {
    if (vsParValue === null) return 'bg-silver text-gray-600'
    if (vsParValue < 0) return 'bg-[#CC0131] text-white'
    if (vsParValue === 0) return 'bg-silver text-gray-700'
    return 'bg-forest text-white'
  }

  function badgeLabel(displayScore, vsParValue) {
    if (!displayScore && displayScore !== 0) return '—'
    if (vsParValue === null) return displayScore
    if (vsParValue === 0) return 'E'
    if (vsParValue > 0) return `+${vsParValue}`
    return vsParValue
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate('/tournaments')}
        className="text-forest font-semibold text-sm hover:underline"
      >
        ← Tournaments
      </button>

      {/* Tournament name */}
      <h1 className="font-display font-black text-3xl text-gray-900">{tournament.name}</h1>

      {/* Action row: Add Scores + Handicap toggle */}
      <div className="flex items-center justify-between gap-3">
        {canAddScores && (
          <Link
            to={`/scorecard/${myReg.registration_id}`}
            className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors"
          >
            + Add Scores
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Handicap</span>
          <button
            onClick={() => setHandicapOn((on) => !on)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              handicapOn ? 'bg-forest' : 'bg-silver'
            }`}
            role="switch"
            aria-checked={handicapOn}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                handicapOn ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-xs text-gray-500">{handicapOn ? 'On' : 'Off'}</span>
        </div>
      </div>

      {/* Leaderboard section */}
      <section className="bg-white rounded-xl border border-silver overflow-hidden">
        <button
          onClick={() => setLeaderboardOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 font-display font-bold text-lg text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <span>Leaderboard</span>
          <span className="text-gray-400">{leaderboardOpen ? '∧' : '∨'}</span>
        </button>

        {leaderboardOpen && (
          <div className="border-t border-silver">
            {rows.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">No scores yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-forest text-white text-xs">
                    <th className="px-4 py-2 text-left font-semibold w-6">#</th>
                    <th className="px-2 py-2 text-left font-semibold">Player</th>
                    <th className="px-2 py-2 text-center font-semibold">+/-</th>
                    <th className="px-4 py-2 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-b border-silver last:border-b-0 ${row.forfeit ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs w-6">{row.forfeit ? '' : i + 1}</td>
                      <td className="px-2 py-3 font-bold text-gray-900">
                        {row.name}
                        {row.forfeit && (
                          <span className="ml-2 text-xs text-[#CC0131] font-semibold">FORFEIT</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${badgeClass(row.vsParValue)}`}>
                          {badgeLabel(row.displayScore, row.vsParValue)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.displayScore || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* Rounds section */}
      {rounds.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-bold text-xl text-gray-900">Rounds</h2>
          {rounds.map((r) => (
            <div key={r.round_id} className="bg-white rounded-xl border border-silver p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{r.label || `Round ${r.round_number}`}</p>
                <p className="text-xs text-gray-500">Round {r.round_number}</p>
              </div>
              <Link
                to={`/leaderboard/${tournamentId}/round/${r.round_id}`}
                className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors"
              >
                Scores
              </Link>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
