import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Scorecard() {
  useEffect(() => {
    document.title = 'Scorecard | Mini Golf Masters'
    document.body.style.backgroundColor = '#135D40'
    return () => {
      document.body.style.backgroundColor = ''
    }
  }, [])

  const { registrationId, roundId } = useParams()
  const navigate = useNavigate()

  const [allRounds, setAllRounds] = useState([])
  const [tournamentId, setTournamentId] = useState(null)
  const [tournamentName, setTournamentName] = useState('')
  const [holes, setHoles] = useState([])
  const [pars, setPars] = useState({})       // hole_id -> par_strokes
  const [scores, setScores] = useState({})   // hole_id -> strokes (local display)
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const activeRoundId = roundId || (allRounds[0]?.round_id)

  useEffect(() => {
    async function load() {
      const registration = await api.get(`/registrations/${registrationId}`)
      const tId = registration.tournament_id

      const [rounds, tournament, existingScores] = await Promise.all([
        api.get(`/rounds/?tournament_id=${tId}`),
        api.get(`/tournaments/${tId}`),
        api.get(`/scores/?registration_id=${registrationId}`),
      ])

      setAllRounds(rounds.sort((a, b) => a.round_number - b.round_number))
      setTournamentId(tId)
      setTournamentName(tournament.name)

      if (!roundId && rounds.length > 0) {
        navigate(`/scorecard/${registrationId}/${rounds[0].round_id}`, { replace: true })
        return
      }

      const targetRoundId = roundId || rounds[0]?.round_id
      const round = rounds.find((r) => r.round_id === targetRoundId) || rounds[0]
      if (!round) { setLoading(false); return }

      const [courseHoles, parsForDate] = await Promise.all([
        api.get(`/courses/${round.course_id}/holes`),
        api.get(`/pars/?tournament_start_date=${tournament.start_date}`),
      ])

      let resolvedPars = parsForDate
      if (resolvedPars.length === 0) {
        const allPars = await api.get('/pars/')
        resolvedPars = allPars.filter((p) => String(p.active_to).slice(0, 10) === '9999-12-31')
      }
      const parMap = Object.fromEntries(resolvedPars.map((p) => [p.hole_id, Number(p.par_strokes)]))

      const roundScores = existingScores.filter((s) => s.round_id === round.round_id)
      const scoreMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, Number(s.strokes)]))

      const sortedHoles = courseHoles.sort((a, b) => a.hole_number - b.hole_number)
      const initialScores = {}
      sortedHoles.forEach((h) => {
        initialScores[h.hole_id] = scoreMap[h.hole_id] ?? parMap[h.hole_id] ?? 3
      })

      setHoles(sortedHoles)
      setPars(parMap)
      setScores(initialScores)
      setCurrentHoleIndex(0)
      setLoading(false)
    }
    load()
  }, [registrationId, roundId])

  function handleRoundChange(newRoundId) {
    navigate(`/scorecard/${registrationId}/${newRoundId}`)
  }

  function handleHoleChange(index) {
    setSaveError(null)
    setCurrentHoleIndex(Number(index))
  }

  async function handleSave() {
    setSaveError(null)
    setIsSaving(true)
    try {
      await api.post('/scores/', {
        scores: [{
          registration_id: registrationId,
          round_id: activeRoundId,
          hole_id: holeId,
          strokes: score,
        }],
      })
      // On success advance to next hole (or finish)
      if (!isLast) {
        setCurrentHoleIndex((i) => i + 1)
      } else {
        navigate('/registrations')
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to save score. Tap to retry.')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-forest min-h-screen flex items-center justify-center">
        <p className="text-white/70">Loading scorecard…</p>
      </div>
    )
  }

  if (holes.length === 0) {
    return (
      <div className="bg-forest min-h-screen flex items-center justify-center">
        <p className="text-white/70">No holes found for this round.</p>
      </div>
    )
  }

  const currentHole = holes[currentHoleIndex]
  const holeId = currentHole.hole_id
  const par = pars[holeId] ?? 'Not Set'
  const score = scores[holeId] ?? (typeof par === 'number' ? par : 3)
  const MIN_SCORE = 1
  const MAX_SCORE = 20
  const isFirst = currentHoleIndex === 0
  const isLast = currentHoleIndex === holes.length - 1

  function decrementScore() {
    if (score <= MIN_SCORE) return
    setScores((s) => ({ ...s, [holeId]: score - 1 }))
    setSaveError(null)
  }

  function incrementScore() {
    if (score >= MAX_SCORE) return
    setScores((s) => ({ ...s, [holeId]: score + 1 }))
    setSaveError(null)
  }

  function goToPrev() {
    setSaveError(null)
    if (currentHoleIndex > 0) {
      setCurrentHoleIndex(currentHoleIndex - 1)
    } else {
      navigate(-1)
    }
  }

  function goToNext() {
    setSaveError(null)
    if (currentHoleIndex < holes.length - 1) {
      setCurrentHoleIndex(currentHoleIndex + 1)
    }
  }

  return (
    <div className="bg-forest min-h-screen text-white pb-10">
      {/* Back link */}
      <div className="px-6 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 font-semibold text-sm hover:text-white"
        >
          ← Back
        </button>
      </div>

      {/* Tournament name */}
      <div className="px-6 pt-2">
        <p className="text-xl font-semibold text-white">{tournamentName}</p>
      </div>

      {/* Round + Hole selectors */}
      <div className="px-6 mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/60 mb-1 font-semibold">Round</label>
          <select
            value={activeRoundId || ''}
            onChange={(e) => handleRoundChange(e.target.value)}
            className="w-full bg-white/10 border border-white/30 text-white font-semibold rounded-xl px-3 py-2 text-md focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            {allRounds.map((r) => (
              <option key={r.round_id} value={r.round_id} className="text-gray-900 bg-white">
                {r.label || `Round ${r.round_number}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1 font-semibold">Hole</label>
          <select
            value={currentHoleIndex}
            onChange={(e) => handleHoleChange(e.target.value)}
            className="w-full bg-white/10 border border-white/30 text-white font-semibold rounded-xl px-3 py-2 text-md focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            {holes.map((h, idx) => (
              <option key={h.hole_id} value={idx} className="text-gray-900 bg-white">
                Hole {h.hole_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Round / Hole / Par display */}
      {(() => {
        const activeRound = allRounds.find((r) => r.round_id === activeRoundId)
        const roundLabel = activeRound ? (activeRound.label || `Round ${activeRound.round_number}`) : ''
        return (
          <div className="px-6 mt-4 text-center">
            <p className="text-2xl font-display font-black text-white">
              {roundLabel} | Hole: {currentHole.hole_number}
            </p>
            <p className="text-base font-semibold text-white/70 mt-1">Par: {par}</p>
          </div>
        )
      })()}

      {/* Save error */}
      {saveError && (
        <div className="mx-6 mt-3">
          <p className="w-full bg-[#CC0131] text-white text-sm font-semibold py-2 px-3 rounded-lg text-center">
            {saveError}
          </p>
        </div>
      )}

      {/* Score display card */}
      <div className="bg-white rounded-2xl mx-6 mt-4 py-10 text-center">
        <span className="font-display font-black text-7xl text-gray-900">{score}</span>
      </div>

      {/* Stepper buttons */}
      <div className="mx-6 mt-4 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={decrementScore}
          disabled={score <= MIN_SCORE}
          style={{ backgroundColor: '#f0fdf4' }}
          className="h-44 rounded-2xl flex items-center justify-center text-6xl font-black text-gray-900 cursor-pointer active:scale-95 transition-transform disabled:opacity-40"
          aria-label="Decrease"
        >
          −
        </button>
        <button
          type="button"
          onClick={incrementScore}
          disabled={score >= MAX_SCORE}
          style={{ backgroundColor: '#fef2f2' }}
          className="h-44 rounded-2xl flex items-center justify-center text-6xl font-black text-gray-900 cursor-pointer active:scale-95 transition-transform disabled:opacity-40"
          aria-label="Increase"
        >
          +
        </button>
      </div>

      {/* Save button — full width, white bg, black text */}
      <div className="mx-6 mt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-white text-gray-900 font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : isLast ? 'Save & Complete Round' : 'Save'}
        </button>
      </div>

      {/* Back / Next navigation — smaller */}
      <div className="mx-6 mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={goToPrev}
          className="bg-forest border border-white/50 text-white/90 rounded-xl py-3 text-sm font-semibold text-center cursor-pointer hover:opacity-90 transition-opacity"
        >
          {isFirst ? '← Back' : '← Prev Hole'}
        </button>
        <button
          onClick={goToNext}
          disabled={isLast}
          className="bg-forest border border-white/50 text-white/90 rounded-xl py-3 text-sm font-semibold text-center cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          Next Hole →
        </button>
      </div>

      {/* See all scores link */}
      {tournamentId && activeRoundId && (
        <div className="text-center mt-8">
          <Link
            to={`/leaderboard/${tournamentId}/round/${activeRoundId}`}
            className="text-white underline underline-offset-4 text-sm"
          >
            See all scores
          </Link>
        </div>
      )}
    </div>
  )
}
