import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function RoundScores() {
  useEffect(() => {
    document.title = 'Scorecard | Mini Golf Masters'
  }, [])

  const { tournamentId, roundId } = useParams()
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
        const [tournament, rounds, scores, users, registrations, allPars, handicaps] = await Promise.all([
          api.get(`/tournaments/${tournamentId}`),
          api.get(`/rounds/?tournament_id=${tournamentId}`),
          api.get(`/scores/?`),
          api.get('/users/public'),
          api.get(`/registrations/?tournament_id=${tournamentId}`),
          api.get('/pars/'),
          api.get('/handicaps/'),
        ])

        const round = rounds.find((r) => r.round_id === roundId) || rounds[0]
        let holes = []
        if (round?.course_id) {
          holes = await api.get(`/courses/${round.course_id}/holes`)
          holes = holes.sort((a, b) => a.hole_number - b.hole_number)
        }

        let activePars = allPars.filter(
          (p) =>
            p.active_from.slice(0, 10) <= tournament.start_date &&
            p.active_to.slice(0, 10) >= tournament.start_date
        )
        if (activePars.length === 0) {
          activePars = allPars.filter((p) => String(p.active_to).slice(0, 10) === '9999-12-31')
        }
        const parMap = Object.fromEntries(activePars.map((p) => [p.hole_id, Number(p.par_strokes)]))

        const roundScores = scores.filter((s) => s.round_id === roundId)

        setData({ tournament, round, holes, roundScores, users, registrations, parMap, handicaps })
      } catch (err) {
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId, roundId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!data) return null

  const { tournament, round, holes, roundScores, users, registrations, parMap, handicaps } = data

  // Check if user has accepted registration and tournament is active
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

  // Build player rows for the hole-by-hole table
  const accepted = registrations.filter((r) => r.status === 'accepted' || r.status === 'forfeit')
  const playerRows = accepted.map((reg) => {
    const u = users.find((x) => x.user_id === reg.user_id) || {}
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    const scoreMap = {}
    roundScores
      .filter((s) => s.registration_id === reg.registration_id)
      .forEach((s) => {
        scoreMap[s.hole_id] = Number(s.strokes)
      })
    const handicap = handicaps.find(
      (h) =>
        h.user_id === reg.user_id &&
        h.active_from.slice(0, 10) <= tournament.start_date &&
        h.active_to.slice(0, 10) >= tournament.start_date
    )
    const gross = Object.values(scoreMap).reduce((sum, s) => sum + (s || 0), 0)
    const net = gross - (Number(handicap?.strokes) || 0)
    const totalPar = holes.reduce((sum, h) => sum + (parMap[h.hole_id] || 0), 0)
    const displayScore = handicapOn ? net : gross
    const vsParValue = totalPar > 0 && displayScore > 0 ? displayScore - totalPar : null
    return { name, scoreMap, gross, net, displayScore, vsParValue, forfeit: reg.status === 'forfeit' }
  })

  const leaderboardRows = [...playerRows]
    .sort((a, b) => {
      if (a.forfeit !== b.forfeit) return a.forfeit ? 1 : -1
      return a.displayScore - b.displayScore
    })

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
        onClick={() => navigate(`/leaderboard/${tournamentId}`)}
        className="text-forest font-semibold text-sm hover:underline"
      >
        ← {tournament.name}
      </button>

      {/* Round header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-black text-3xl text-gray-900">
          {round?.label || `Round ${round?.round_number || '—'}`}
        </h1>
        {canAddScores && (
          <Link
            to={`/scorecard/${myReg.registration_id}/${roundId}`}
            className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors shrink-0"
          >
            + Add Scores
          </Link>
        )}
      </div>

      {round?.label && (
        <p className="text-sm text-gray-500 -mt-4">Round {round.round_number}</p>
      )}

      {/* Handicap toggle */}
      <div className="flex items-center justify-end gap-2">
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
            {leaderboardRows.length === 0 ? (
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
                  {leaderboardRows.map((row, i) => (
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

      {/* Hole-by-hole table */}
      {holes.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display font-bold text-xl text-gray-900">Scores by Hole</h2>
          <div className="overflow-x-auto rounded-xl border border-silver">
            <table className="text-sm min-w-max w-full">
              <thead>
                <tr className="bg-forest text-white">
                  <th className="text-left px-4 py-2 font-semibold sticky left-0 bg-forest">Player</th>
                  {holes.map((h) => (
                    <th key={h.hole_id} className="text-center px-3 py-2 font-semibold min-w-[3rem]">
                      {h.hole_number}
                    </th>
                  ))}
                </tr>
                <tr className="bg-emerald/10">
                  <td className="text-left px-4 py-2 font-semibold text-gray-700 sticky left-0 bg-emerald/10">Par</td>
                  {holes.map((h) => (
                    <td key={h.hole_id} className="text-center px-3 py-2 font-bold text-gray-800">
                      {parMap[h.hole_id] ?? '—'}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerRows.map((player, i) => (
                  <tr key={i} className={`border-t border-silver ${player.forfeit ? 'opacity-50' : ''}`}>
                    <td className="text-left px-4 py-2 font-bold text-gray-900 sticky left-0 bg-white">
                      {player.name}
                      {player.forfeit && (
                        <span className="ml-1 text-xs text-[#CC0131] font-semibold">F</span>
                      )}
                    </td>
                    {holes.map((h) => (
                      <td key={h.hole_id} className="text-center px-3 py-2 text-gray-700">
                        {player.scoreMap[h.hole_id] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
