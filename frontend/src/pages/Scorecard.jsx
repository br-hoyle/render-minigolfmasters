import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import ScoreStepper from '../components/ScoreStepper'

export default function Scorecard() {
  useEffect(() => {
    document.title = 'Scorecard | Mini Golf Masters'
  }, [])

  const { registrationId, roundId } = useParams()

  const [holes, setHoles] = useState([])
  const [pars, setPars] = useState({}) // hole_id -> par_strokes
  const [scores, setScores] = useState({}) // hole_id -> strokes (optimistic)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState(null)
  const pendingRef = useRef({})
  const timerRef = useRef(null)

  useEffect(() => {
    async function load() {
      const [round, existingScores] = await Promise.all([
        api.get(`/rounds/${roundId}`),
        api.get(`/scores/?registration_id=${registrationId}`),
      ])

      const [courseHoles, parsData, tournament] = await Promise.all([
        api.get(`/courses/${round.course_id}/holes`),
        api.get('/pars/'),
        api.get(`/tournaments/${round.tournament_id}`),
      ])

      const activePars = parsData.filter(
        (p) =>
          p.active_from <= tournament.start_date && p.active_to >= tournament.start_date
      )
      const parMap = Object.fromEntries(activePars.map((p) => [p.hole_id, p.par_strokes]))

      const roundScores = existingScores.filter((s) => s.round_id === roundId)
      const scoreMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, s.strokes]))

      // Default to par for unplayed holes
      const initialScores = {}
      courseHoles.forEach((h) => {
        initialScores[h.hole_id] = scoreMap[h.hole_id] ?? parMap[h.hole_id] ?? 3
      })

      setHoles(courseHoles.sort((a, b) => a.hole_number - b.hole_number))
      setPars(parMap)
      setScores(initialScores)
      setLoading(false)
    }
    load()
  }, [registrationId, roundId])

  function handleScoreChange(holeId, value) {
    setScores((s) => ({ ...s, [holeId]: value }))
    pendingRef.current[holeId] = value
    setSaveError(null)

    // Debounce flush: save 1.5s after last change
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 1500)
  }

  async function flush() {
    const pending = { ...pendingRef.current }
    if (Object.keys(pending).length === 0) return
    pendingRef.current = {}

    const scoresList = Object.entries(pending).map(([hole_id, strokes]) => ({
      registration_id: registrationId,
      round_id: roundId,
      hole_id,
      strokes,
    }))

    try {
      await api.post('/scores/', { scores: scoresList })
    } catch (err) {
      setSaveError('Failed to save scores. Tap to retry.')
      // Put them back in pending
      Object.assign(pendingRef.current, pending)
    }
  }

  const gross = Object.values(scores).reduce((sum, s) => sum + (s || 0), 0)
  const totalPar = holes.reduce((sum, h) => sum + (pars[h.hole_id] || 0), 0)

  if (loading) return <div className="p-8 text-center text-gray-400">Loading scorecard…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-black text-2xl text-forest">Scorecard</h1>
        <div className="text-right">
          <div className="text-xs text-gray-400">Total</div>
          <div className="font-display font-bold text-2xl text-forest">{gross}</div>
          <div className="text-xs text-gray-400">Par {totalPar}</div>
        </div>
      </div>

      {saveError && (
        <button
          onClick={flush}
          className="w-full bg-[#CC0131] text-white text-sm font-semibold py-2 rounded-lg"
        >
          {saveError}
        </button>
      )}

      <div className="space-y-2">
        {holes.map((hole) => (
          <ScoreStepper
            key={hole.hole_id}
            holeNumber={hole.hole_number}
            par={pars[hole.hole_id] || 3}
            value={scores[hole.hole_id] || pars[hole.hole_id] || 3}
            onChange={(v) => handleScoreChange(hole.hole_id, v)}
          />
        ))}
      </div>

      <button
        onClick={flush}
        className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors mt-4"
      >
        Save Scores
      </button>
    </div>
  )
}
