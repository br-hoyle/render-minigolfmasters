import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import LoadingOverlay from '../../components/LoadingOverlay'

export default function AdminRoundScores() {
  useEffect(() => {
    document.title = 'Round Scores | Mini Golf Masters'
  }, [])

  const { tournamentId, roundId } = useParams()

  const [tournament, setTournament] = useState(null)
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [players, setPlayers] = useState([]) // { registration_id, user_id, name, forfeit, scoreMap }
  const [parMap, setParMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { registrationId, holeId }
  const [editingValue, setEditingValue] = useState('')
  const [saveErrors, setSaveErrors] = useState({}) // key = `regId-holeId`

  const pendingRef = useRef({}) // key = `regId-holeId` -> { registration_id, hole_id, strokes }
  const timerRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const [t, roundData, registrations, allUsers, allScores, allPars] = await Promise.all([
          api.get(`/tournaments/${tournamentId}`),
          api.get(`/rounds/${roundId}`),
          api.get(`/registrations/?tournament_id=${tournamentId}`),
          api.get('/users/'),
          api.get(`/scores/?`),
          api.get('/pars/'),
        ])

        setTournament(t)
        setRound(roundData)

        const courseHoles = await api.get(`/courses/${roundData.course_id}/holes`)
        const sortedHoles = courseHoles.sort((a, b) => a.hole_number - b.hole_number)
        setHoles(sortedHoles)

        const activePars = allPars.filter((p) => p.active_to === '9999-12-31')
        const pm = Object.fromEntries(activePars.map((p) => [p.hole_id, Number(p.par_strokes)]))
        setParMap(pm)

        const accepted = registrations.filter(
          (r) => r.status === 'accepted' || r.status === 'forfeit'
        )

        const roundScores = allScores.filter((s) => s.round_id === roundId)

        const playerRows = accepted.map((reg) => {
          const u = allUsers.find((x) => x.user_id === reg.user_id) || {}
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim()
          const scoreMap = {}
          roundScores
            .filter((s) => s.registration_id === reg.registration_id)
            .forEach((s) => {
              scoreMap[s.hole_id] = Number(s.strokes)
            })
          return {
            registration_id: reg.registration_id,
            user_id: reg.user_id,
            name,
            forfeit: reg.status === 'forfeit',
            scoreMap,
          }
        })

        setPlayers(playerRows)
      } catch (err) {
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId, roundId])

  function cellKey(registrationId, holeId) {
    return `${registrationId}-${holeId}`
  }

  function handleCellClick(registrationId, holeId, currentValue) {
    setEditingCell({ registrationId, holeId })
    setEditingValue(String(currentValue ?? ''))
  }

  function handleCellChange(e) {
    setEditingValue(e.target.value)
  }

  function commitEdit(registrationId, holeId) {
    const strokes = parseInt(editingValue)
    if (isNaN(strokes) || strokes < 1 || strokes > 20) {
      setEditingCell(null)
      return
    }

    // Optimistic update
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.registration_id !== registrationId) return p
        return { ...p, scoreMap: { ...p.scoreMap, [holeId]: strokes } }
      })
    )

    const key = cellKey(registrationId, holeId)
    pendingRef.current[key] = { registration_id: registrationId, round_id: roundId, hole_id: holeId, strokes }
    setSaveErrors((prev) => ({ ...prev, [key]: null }))

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flushPending(), 1000)

    setEditingCell(null)
  }

  async function flushPending() {
    const pending = { ...pendingRef.current }
    if (Object.keys(pending).length === 0) return
    pendingRef.current = {}

    const scoresList = Object.values(pending)

    try {
      await api.post('/scores/', { scores: scoresList })
    } catch (err) {
      // Mark failed cells
      const errors = {}
      scoresList.forEach((s) => {
        errors[cellKey(s.registration_id, s.hole_id)] = 'Save failed'
      })
      setSaveErrors((prev) => ({ ...prev, ...errors }))
      // Re-queue for retry
      Object.assign(pendingRef.current, pending)
    }
  }

  function handleKeyDown(e, registrationId, holeId) {
    if (e.key === 'Enter') commitEdit(registrationId, holeId)
    if (e.key === 'Escape') setEditingCell(null)
  }

  if (loading) return <LoadingOverlay />
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!tournament || !round) return null

  // Compute missing scores summary
  const missingScores = players
    .filter((p) => !p.forfeit)
    .flatMap((p) => {
      const missingHoles = holes.filter((h) => p.scoreMap[h.hole_id] === undefined)
      return missingHoles.length > 0 ? [{ name: p.name, holes: missingHoles.map((h) => h.hole_number) }] : []
    })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link
        to={`/admin/tournaments/${tournamentId}`}
        className="text-forest font-semibold text-sm hover:underline block"
      >
        ← Manage Tournament
      </Link>

      {/* Heading */}
      <div>
        <h1 className="font-display font-black text-3xl text-gray-900">
          {round.label || `Round ${round.round_number}`}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{tournament.name}</p>
      </div>

      {players.length === 0 && (
        <p className="text-gray-400 text-sm">No accepted players yet.</p>
      )}

      {/* Missing scores summary */}
      {missingScores.length > 0 && (
        <details className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <summary className="font-semibold text-amber-800 cursor-pointer">
            {missingScores.length} player{missingScores.length !== 1 ? 's' : ''} missing scores
          </summary>
          <ul className="mt-2 space-y-1">
            {missingScores.map(({ name, holes: missingHoles }) => (
              <li key={name} className="text-amber-700">
                <span className="font-medium">{name}</span>
                {' — '}missing holes: {missingHoles.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Score grid */}
      {players.length > 0 && holes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-silver">
          <table className="text-sm min-w-max w-full">
            <thead>
              <tr className="bg-forest text-white">
                <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-forest min-w-[140px]">
                  Player
                </th>
                {holes.map((h) => (
                  <th key={h.hole_id} className="text-center px-3 py-3 font-semibold min-w-[3.5rem]">
                    {h.hole_number}
                  </th>
                ))}
                <th className="text-center px-3 py-3 font-semibold">Total</th>
              </tr>
              <tr className="bg-[#cce3d8]">
                <td className="text-left px-4 py-2 font-semibold text-gray-600 sticky left-0 bg-[#cce3d8]">
                  Par
                </td>
                {holes.map((h) => (
                  <td key={h.hole_id} className="text-center px-3 py-2 font-bold text-gray-700">
                    {parMap[h.hole_id] ?? '—'}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-gray-700">
                  {holes.reduce((sum, h) => sum + (parMap[h.hole_id] || 0), 0) || '—'}
                </td>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const total = holes.reduce(
                  (sum, h) => sum + (player.scoreMap[h.hole_id] || 0),
                  0
                )
                return (
                  <tr
                    key={player.registration_id}
                    className={`border-t border-silver ${player.forfeit ? 'opacity-50' : ''}`}
                  >
                    <td className="text-left px-4 py-2 font-bold text-gray-900 sticky left-0 bg-white">
                      {player.name}
                      {player.forfeit && (
                        <span className="ml-1 text-xs text-[#CC0131] font-semibold">F</span>
                      )}
                    </td>
                    {holes.map((h) => {
                      const key = cellKey(player.registration_id, h.hole_id)
                      const isEditing =
                        editingCell?.registrationId === player.registration_id &&
                        editingCell?.holeId === h.hole_id
                      const value = player.scoreMap[h.hole_id]
                      const hasError = saveErrors[key]
                      const isMissing = value === undefined && !player.forfeit

                      return (
                        <td
                          key={h.hole_id}
                          className={`text-center px-1 py-1 ${hasError ? 'bg-red-50' : isMissing ? 'bg-amber-50' : ''}`}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={editingValue}
                              onChange={handleCellChange}
                              onBlur={() => commitEdit(player.registration_id, h.hole_id)}
                              onKeyDown={(e) => handleKeyDown(e, player.registration_id, h.hole_id)}
                              autoFocus
                              className="w-12 text-center border border-forest rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest"
                            />
                          ) : (
                            <button
                              onClick={() => handleCellClick(player.registration_id, h.hole_id, value)}
                              className={`w-12 h-8 rounded text-center text-sm font-medium transition-colors ${
                                value !== undefined
                                  ? 'bg-gray-50 hover:bg-forest/10 text-gray-900'
                                  : 'bg-transparent hover:bg-gray-50 text-gray-300'
                              }`}
                            >
                              {value !== undefined ? value : '—'}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="text-center px-3 py-2 font-bold text-gray-700">
                      {total > 0 ? total : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Click any score cell to edit. Changes save automatically.
      </p>
    </div>
  )
}
