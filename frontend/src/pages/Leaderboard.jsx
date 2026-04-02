import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

function parBadge(score, par) {
  if (typeof par !== 'number' || typeof score !== 'number') return null
  const diff = score - par
  if (diff <= -2) return { label: 'Eagle', cls: 'bg-[#079E78] text-white' }
  if (diff === -1) return { label: 'Birdie', cls: 'bg-[#079E78] text-white' }
  if (diff === 0) return { label: 'Par', cls: 'bg-[#E0E1E5] text-gray-700' }
  if (diff === 1) return { label: 'Bogey', cls: 'bg-[#CC0131] text-white' }
  if (diff === 2) return { label: 'Double', cls: 'bg-[#CC0131] text-white' }
  return { label: `+${diff}`, cls: 'bg-[#CC0131] text-white' }
}

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
  const [selectedRoundFilter, setSelectedRoundFilter] = useState('overall')
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [holesByRound, setHolesByRound] = useState({}) // course_id → holes[]
  const [loadingHoles, setLoadingHoles] = useState({}) // course_id → bool

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

        // Fetch holes for each unique course used in this tournament's rounds
        const uniqueCourseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))]
        const holesArrays = await Promise.all(
          uniqueCourseIds.map((id) => api.get(`/courses/${id}/holes`))
        )
        const holeByCourseId = Object.fromEntries(
          uniqueCourseIds.map((id, i) => [id, holesArrays[i]])
        )

        setData({ tournament, registrations, scores, users, rounds, pars, handicaps, holeByCourseId })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId])

  const fetchHolesForRound = useCallback(async (courseId) => {
    if (holesByRound[courseId] || loadingHoles[courseId]) return
    setLoadingHoles((prev) => ({ ...prev, [courseId]: true }))
    try {
      const holes = await api.get(`/courses/${courseId}/holes`)
      setHolesByRound((prev) => ({ ...prev, [courseId]: holes }))
    } catch {
      // silently fail — drill-down will show dashes
    } finally {
      setLoadingHoles((prev) => ({ ...prev, [courseId]: false }))
    }
  }, [holesByRound, loadingHoles])

  const handlePlayerClick = useCallback((userId, rounds) => {
    setExpandedPlayer((prev) => (prev === userId ? null : userId))
    // Pre-fetch holes for all rounds
    for (const round of rounds) {
      fetchHolesForRound(round.course_id)
    }
  }, [fetchHolesForRound])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!data) return null

  const { tournament, registrations, scores, users, rounds, pars, handicaps, holeByCourseId } = data

  const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number)

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

  // Filter scores by round selection — single round only (not cumulative)
  const filteredScores = (() => {
    if (selectedRoundFilter === 'overall') return scores
    return scores.filter((s) => s.round_id === selectedRoundFilter)
  })()

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

  // Helper: sum pars for a given array of holes
  function parForHoles(holes) {
    return holes.reduce((sum, h) => {
      const p = activePars.find((ap) => ap.hole_id === h.hole_id)
      return sum + (Number(p?.par_strokes) || 0)
    }, 0)
  }

  // Compute total par for the current filter
  const totalPar = (() => {
    if (selectedRoundFilter === 'overall') {
      // Sum par for each round separately (same course can appear in multiple rounds)
      return rounds.reduce((sum, r) => {
        const holes = holeByCourseId[r.course_id] || []
        return sum + parForHoles(holes)
      }, 0)
    }
    const selectedRound = rounds.find((r) => r.round_id === selectedRoundFilter)
    if (!selectedRound) return 0
    const holes = holeByCourseId[selectedRound.course_id] || []
    return parForHoles(holes)
  })()

  const rows = accepted.map((reg) => {
    const u = users.find((u) => u.user_id === reg.user_id) || {}
    const handicap = handicaps.find(
      (h) =>
        h.user_id === reg.user_id &&
        h.active_from.slice(0, 10) <= tournament.start_date &&
        h.active_to.slice(0, 10) >= tournament.start_date
    )
    const playerScores = filteredScores.filter((s) => s.registration_id === reg.registration_id)
    const gross = playerScores.reduce((sum, s) => sum + (Number(s.strokes) || 0), 0)
    const net = gross - (Number(handicap?.strokes) || 0)
    const displayScore = handicapOn ? net : gross
    const vsParValue = totalPar > 0 && gross > 0 ? displayScore - totalPar : null
    return {
      user_id: reg.user_id,
      registration_id: reg.registration_id,
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
    if (a.gross === 0 && b.gross > 0) return 1
    if (b.gross === 0 && a.gross > 0) return -1
    return a.displayScore - b.displayScore
  })

  function badgeClass(vsParValue) {
    if (vsParValue === null) return 'bg-[#E0E1E5] text-gray-600'
    if (vsParValue < 0) return 'bg-[#CC0131] text-white'
    if (vsParValue === 0) return 'bg-[#E0E1E5] text-gray-700'
    return 'bg-[#135D40] text-white'
  }

  function badgeLabel(displayScore, vsParValue) {
    if (!displayScore && displayScore !== 0) return '—'
    if (vsParValue === null) return displayScore
    if (vsParValue === 0) return 'E'
    if (vsParValue > 0) return `+${vsParValue}`
    return vsParValue
  }

  function placeDisplay(i, row) {
    if (row.forfeit) return ''
    if (row.gross === 0) return '—'
    if (i === 0) return '🥇'
    if (i === 1) return '🥈'
    if (i === 2) return '🥉'
    return i + 1
  }

  // Build drill-down data for a player
  function buildDrillDown(userId, registrationId) {
    return sortedRounds.map((round) => {
      const holes = holesByRound[round.course_id] || []
      const sortedHoles = [...holes].sort((a, b) => a.hole_number - b.hole_number)
      const roundScores = scores.filter(
        (s) => s.registration_id === registrationId && s.round_id === round.round_id
      )
      const scoreMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, Number(s.strokes)]))
      const parMap = Object.fromEntries(
        activePars.map((p) => [p.hole_id, Number(p.par_strokes)])
      )
      const roundGross = roundScores.reduce((sum, s) => sum + (Number(s.strokes) || 0), 0)
      return { round, sortedHoles, scoreMap, parMap, roundGross }
    })
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate('/tournaments')}
        className="text-[#135D40] font-semibold text-sm hover:underline"
      >
        ← Tournaments
      </button>

      {/* Tournament name + recap link */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display font-black text-3xl text-gray-900">{tournament.name}</h1>
        {tournament.status === 'complete' && (
          <Link
            to={`/tournaments/${tournamentId}/recap`}
            className="shrink-0 text-xs font-bold text-[#135D40] border border-[#135D40] px-3 py-1.5 rounded-full hover:bg-forest hover:text-white transition-colors mt-1"
          >
            View Recap →
          </Link>
        )}
      </div>

      {/* Action row: Add Scores + Handicap toggle */}
      <div className="flex items-center justify-between gap-3">
        {canAddScores && (
          <Link
            to={`/scorecard/${myReg.registration_id}`}
            className="bg-[#135D40] text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-[#079E78] transition-colors"
          >
            + Add Scores
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Handicap</span>
          <button
            onClick={() => setHandicapOn((on) => !on)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              handicapOn ? 'bg-[#135D40]' : 'bg-[#E0E1E5]'
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
      <section className="bg-white rounded-xl border border-[#E0E1E5] overflow-hidden">
        <button
          onClick={() => setLeaderboardOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 font-display font-bold text-lg text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <span>Leaderboard</span>
          <span className="text-gray-400">{leaderboardOpen ? '∧' : '∨'}</span>
        </button>

        {leaderboardOpen && (
          <div className="border-t border-[#E0E1E5]">
            {/* Round filter tabs */}
            {sortedRounds.length > 1 && (
              <div className="flex gap-2 px-4 py-3 overflow-x-auto">
                <button
                  onClick={() => setSelectedRoundFilter('overall')}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    selectedRoundFilter === 'overall'
                      ? 'bg-[#135D40] text-white'
                      : 'bg-[#E0E1E5] text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Overall
                </button>
                {sortedRounds.map((r) => (
                  <button
                    key={r.round_id}
                    onClick={() => setSelectedRoundFilter(r.round_id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                      selectedRoundFilter === r.round_id
                        ? 'bg-[#135D40] text-white'
                        : 'bg-[#E0E1E5] text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {r.label || `Round ${r.round_number}`}
                  </button>
                ))}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">No scores yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#135D40] text-white text-xs">
                    <th className="px-4 py-2 text-left font-semibold w-6">#</th>
                    <th className="px-2 py-2 text-left font-semibold">Player</th>
                    <th className="px-2 py-2 text-center font-semibold">+/-</th>
                    <th className="px-4 py-2 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isExpanded = expandedPlayer === row.user_id
                    const drillDown = isExpanded ? buildDrillDown(row.user_id, row.registration_id) : []

                    return (
                      <>
                        <tr
                          key={row.user_id}
                          className={`border-b border-[#E0E1E5] ${row.forfeit ? 'opacity-50' : ''} ${
                            isExpanded ? 'bg-gray-50' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-gray-400 text-xs w-6">
                            {placeDisplay(i, row)}
                          </td>
                          <td className="px-2 py-3 font-bold text-gray-900">
                            <button
                              onClick={() => handlePlayerClick(row.user_id, sortedRounds)}
                              className="text-left hover:text-[#079E78] transition-colors"
                            >
                              {row.name}
                              <span className="ml-1 text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </button>
                            {row.forfeit && (
                              <span className="ml-2 text-xs text-[#CC0131] font-semibold">FORFEIT</span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${badgeClass(row.vsParValue)}`}>
                              {row.gross === 0 ? '—' : badgeLabel(row.displayScore, row.vsParValue)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {row.gross === 0 ? '—' : row.displayScore}
                          </td>
                        </tr>

                        {/* Player drill-down */}
                        {isExpanded && (
                          <tr key={`${row.user_id}-drill`} className="border-b border-[#E0E1E5] bg-gray-50">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="space-y-4">
                                {drillDown.map(({ round, sortedHoles, scoreMap, parMap, roundGross }) => (
                                  <div key={round.round_id}>
                                    <p className="font-bold text-xs text-[#135D40] uppercase tracking-wide mb-2">
                                      {round.label || `Round ${round.round_number}`}
                                      {roundGross > 0 && (
                                        <span className="ml-2 font-normal text-gray-500 normal-case tracking-normal">
                                          ({roundGross} strokes)
                                        </span>
                                      )}
                                    </p>
                                    {loadingHoles[round.course_id] ? (
                                      <p className="text-xs text-gray-400">Loading holes…</p>
                                    ) : sortedHoles.length === 0 ? (
                                      <p className="text-xs text-gray-400">No hole data available.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="text-xs w-full">
                                          <thead>
                                            <tr className="text-gray-500">
                                              <th className="text-left font-semibold pr-3 py-1">Hole</th>
                                              <th className="text-center font-semibold pr-3 py-1">Par</th>
                                              <th className="text-center font-semibold pr-3 py-1">Score</th>
                                              <th className="text-center font-semibold py-1"></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sortedHoles.map((hole) => {
                                              const hScore = scoreMap[hole.hole_id]
                                              const hPar = parMap[hole.hole_id]
                                              const badge = hScore != null ? parBadge(hScore, hPar) : null
                                              return (
                                                <tr key={hole.hole_id} className="border-t border-gray-100">
                                                  <td className="pr-3 py-1 font-medium text-gray-700">{hole.hole_number}</td>
                                                  <td className="pr-3 py-1 text-center text-gray-500">{hPar ?? '—'}</td>
                                                  <td className="pr-3 py-1 text-center font-bold text-gray-900">
                                                    {hScore ?? '—'}
                                                  </td>
                                                  <td className="py-1 text-center">
                                                    {badge && (
                                                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>
                                                        {badge.label}
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {drillDown.every(({ roundGross }) => roundGross === 0) && (
                                  <p className="text-xs text-gray-400 italic">No scores submitted yet.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
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
          {sortedRounds.map((r) => (
            <div key={r.round_id} className="bg-white rounded-xl border border-[#E0E1E5] p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{r.label || `Round ${r.round_number}`}</p>
                <p className="text-xs text-gray-500">Round {r.round_number}</p>
              </div>
              <Link
                to={`/leaderboard/${tournamentId}/round/${r.round_id}`}
                className="bg-[#135D40] text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-[#079E78] transition-colors"
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
