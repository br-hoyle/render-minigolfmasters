import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import ScoreGrid from '../components/ScoreGrid'
import { Spinner } from '../components/LoadingOverlay'
import {
  getQueuedScores,
  queueScores,
  removeQueuedScore,
  getNeedsReview,
  removeNeedsReview,
  syncQueue,
} from '../utils/offlineQueue'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Network failure, timeout (both surface with no .status), or 5xx/503 are
 * treated as transient and worth retrying; everything else (401/403/409/4xx)
 * is a real response and retrying it would just get the same answer again. */
function isRetryableError(err) {
  return err.status === undefined || err.status >= 500
}

const RETRY_BACKOFFS_MS = [1000, 3000]

/** POST /scores/, retrying up to RETRY_BACKOFFS_MS.length times on a
 * transient failure before giving up to the caller's offline/error handling. */
async function postScoresWithRetry(scoreItems) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.post('/scores/', { scores: scoreItems })
    } catch (err) {
      if (attempt >= RETRY_BACKOFFS_MS.length || !isRetryableError(err)) throw err
      await sleep(RETRY_BACKOFFS_MS[attempt])
    }
  }
}

function parLabel(score, par) {
  if (typeof score !== 'number' || typeof par !== 'number') return null
  const diff = score - par
  if (diff <= -2) return { text: 'Eagle', cls: 'bg-emerald text-white' }
  if (diff === -1) return { text: 'Birdie', cls: 'bg-emerald text-white' }
  if (diff === 0) return { text: 'Par', cls: 'bg-silver text-gray-700' }
  if (diff === 1) return { text: 'Bogey', cls: 'bg-[#CC0131] text-white' }
  if (diff === 2) return { text: 'Double Bogey', cls: 'bg-[#CC0131] text-white' }
  return { text: `+${diff}`, cls: 'bg-[#CC0131] text-white' }
}

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
  const [pars, setPars] = useState({})           // hole_id -> par_strokes
  const [scores, setScores] = useState({})       // hole_id -> strokes | null (unscored)
  const [scoreVersions, setScoreVersions] = useState({}) // hole_id -> version (only present once saved)
  const [dirty, setDirty] = useState(new Set())  // hole_ids changed since the last confirmed save
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [viewMode, setViewMode] = useState('stepper') // 'stepper' | 'grid'
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingSync, setPendingSync] = useState(getQueuedScores().length > 0)
  // Queue of conflicts still needing "keep mine / use theirs"; resolved one at a time.
  const [conflictQueue, setConflictQueue] = useState([]) // [{ holeId, strokes, serverStrokes, serverVersion, modifiedBy }]
  const [afterConflicts, setAfterConflicts] = useState(null) // { navigateAfter } | { single, isLast }
  const [roundLocked, setRoundLocked] = useState(false)

  const activeRoundId = roundId || (allRounds[0]?.round_id)

  // Sync offline queue on mount, and keep the local pending banner live as
  // Layout's own triggers (online/visible/30s poll) change the queue too.
  useEffect(() => {
    function refreshPending() {
      setPendingSync(getQueuedScores().length > 0)
    }
    refreshPending()
    window.addEventListener('mgm-offline-queue-changed', refreshPending)
    syncQueue((path, body) => api.post(path, body)).then(refreshPending)
    return () => window.removeEventListener('mgm-offline-queue-changed', refreshPending)
  }, [])

  // Re-open the Keep mine / Use theirs dialog for any hole in this round
  // that a background sync (Layout's triggers) already found a conflict
  // for, so the player resolves it as soon as they're back on the
  // scorecard instead of it sitting silently in the "needs review" banner.
  useEffect(() => {
    if (!activeRoundId) return
    const pending = getNeedsReview().filter(
      (r) => r.registration_id === registrationId && r.round_id === activeRoundId
    )
    if (pending.length === 0) return
    setConflictQueue((q) => (q.length > 0 ? q : pending.map((r) => ({
      holeId: r.hole_id,
      strokes: r.strokes,
      serverStrokes: r.server_strokes,
      serverVersion: r.server_version,
      modifiedBy: r.modified_by,
      source: 'needs_review',
    }))))
  }, [registrationId, activeRoundId])

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

      // Check if round is locked
      setRoundLocked(round.locked === 'true')

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
      const versionMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, Number(s.version || 1)]))

      const sortedHoles = courseHoles.sort((a, b) => a.hole_number - b.hole_number)
      const initialScores = {}
      sortedHoles.forEach((h) => {
        // Unscored holes are null, never defaulted to par — they display as "—".
        initialScores[h.hole_id] = scoreMap[h.hole_id] ?? null
      })

      setHoles(sortedHoles)
      setPars(parMap)
      setScores(initialScores)
      setScoreVersions(versionMap)
      setDirty(new Set())
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

  function markDirty(holeId) {
    setDirty((d) => {
      if (d.has(holeId)) return d
      const next = new Set(d)
      next.add(holeId)
      return next
    })
  }

  function clearDirty(holeId) {
    setDirty((d) => {
      if (!d.has(holeId)) return d
      const next = new Set(d)
      next.delete(holeId)
      return next
    })
  }

  function handleGridScoreChange(holeId, value) {
    setScores((s) => ({ ...s, [holeId]: value }))
    markDirty(holeId)
  }

  /** Apply the "saved" items from a bulk response: update versions, clear
   * dirty, and drop any now-stale queued entry for the same hole so it can
   * never later overwrite this (newer) confirmed value. */
  function applySavedResults(savedList) {
    if (!savedList || savedList.length === 0) return
    setScoreVersions((v) => {
      const next = { ...v }
      savedList.forEach((s) => { next[s.hole_id] = s.version })
      return next
    })
    setDirty((d) => {
      const next = new Set(d)
      savedList.forEach((s) => next.delete(s.hole_id))
      return next
    })
    savedList.forEach((s) => removeQueuedScore(registrationId, activeRoundId, s.hole_id))
  }

  function conflictsFromDetail(detail) {
    if (Array.isArray(detail?.conflicts)) {
      return detail.conflicts.map((c) => ({
        holeId: c.hole_id,
        strokes: scores[c.hole_id],
        serverStrokes: c.current_strokes,
        serverVersion: c.current_version,
        modifiedBy: c.modified_by,
      }))
    }
    if (detail?.current_version !== undefined) {
      return [{
        holeId: detail.hole_id,
        strokes: scores[detail.hole_id],
        serverStrokes: detail.current_strokes,
        serverVersion: detail.current_version,
        modifiedBy: detail.modified_by,
      }]
    }
    return []
  }

  async function saveScore(holeId, strokes, isLast) {
    const expectedVersion = scoreVersions[holeId]
    const scoreItem = {
      registration_id: registrationId,
      round_id: activeRoundId,
      hole_id: holeId,
      strokes,
      expected_version: expectedVersion,
    }
    try {
      const res = await postScoresWithRetry([scoreItem])
      const saved = res?.scores?.[0]
      setScoreVersions((v) => ({ ...v, [holeId]: saved ? saved.version : (expectedVersion || 1) + 1 }))
      clearDirty(holeId)
      removeQueuedScore(registrationId, activeRoundId, holeId)
      if (isLast) {
        navigate('/registrations')
      } else {
        setCurrentHoleIndex((i) => i + 1)
      }
    } catch (err) {
      // Version conflict
      if (err.status === 409) {
        const detail = typeof err.detail === 'object' ? err.detail : {}
        const queue = conflictsFromDetail(detail)
        if (queue.length > 0) {
          applySavedResults(detail.saved)
          setConflictQueue(queue)
          setAfterConflicts({ single: true, isLast })
          return
        }
      }
      // Expired session: queue the score so it isn't lost, but don't
      // pretend the save succeeded — the player needs to log back in.
      if (err.status === 401) {
        queueScores({ scores: [scoreItem] })
        setPendingSync(true)
        setSaveError('Your session expired — log in again to keep saving scores. This one is queued and will sync once you do.')
        return
      }
      // Round locked / tournament not active: don't queue a score that will
      // just be rejected again later. Refresh the lock banner so the player
      // sees why.
      if (err.status === 403) {
        setSaveError(err.message || 'This round is locked for scoring.')
        api.get(`/rounds/${activeRoundId}`).then((r) => setRoundLocked(r.locked === 'true')).catch(() => {})
        return
      }
      // Offline, unreachable server, timeout, or a 5xx we already retried:
      // queue and advance optimistically. navigator.onLine only reflects
      // device connectivity, not whether the request actually reached the
      // backend — on spotty course signal the device can report "online"
      // while every fetch still fails, so also treat any network-layer
      // failure (no HTTP status) as offline.
      if (!navigator.onLine || isRetryableError(err)) {
        queueScores({ scores: [scoreItem] })
        setPendingSync(true)
        if (isLast) {
          navigate('/registrations')
        } else {
          setCurrentHoleIndex((i) => i + 1)
        }
        return
      }
      setSaveError(err.message || 'Failed to save score. Tap to retry.')
    }
  }

  async function handleSave() {
    setSaveError(null)
    const holeId = holes[currentHoleIndex]?.hole_id
    const currentScore = scores[holeId]
    const isLast = currentHoleIndex === holes.length - 1

    // Show confirmation screen before completing the round
    if (isLast) {
      setShowConfirm(true)
      return
    }

    if (currentScore === null || currentScore === undefined) {
      setSaveError('Enter a score before saving.')
      return
    }

    setIsSaving(true)
    await saveScore(holeId, currentScore, false)
    setIsSaving(false)
  }

  /** Submit only dirty, scored holes as a bulk request. Shared by Complete Round and grid submit. */
  async function submitDirtyScores() {
    const dirtyHoles = holes.filter(
      (h) => dirty.has(h.hole_id) && typeof scores[h.hole_id] === 'number'
    )
    if (dirtyHoles.length === 0) {
      navigate('/registrations')
      return
    }
    const scoreItems = dirtyHoles.map((h) => ({
      registration_id: registrationId,
      round_id: activeRoundId,
      hole_id: h.hole_id,
      strokes: scores[h.hole_id],
      expected_version: scoreVersions[h.hole_id],
    }))
    try {
      const res = await postScoresWithRetry(scoreItems)
      applySavedResults(res?.scores)
      navigate('/registrations')
    } catch (err) {
      if (err.status === 409) {
        const detail = typeof err.detail === 'object' ? err.detail : {}
        applySavedResults(detail.saved)
        const queue = conflictsFromDetail(detail)
        if (queue.length > 0) {
          setConflictQueue(queue)
          setAfterConflicts({ navigateAfter: true })
          return
        }
      }
      if (err.status === 401) {
        queueScores({ scores: scoreItems })
        setPendingSync(true)
        setSaveError('Your session expired — log in again. These scores are queued and will sync once you do.')
        return
      }
      if (err.status === 403) {
        setSaveError(err.message || 'This round is locked for scoring.')
        api.get(`/rounds/${activeRoundId}`).then((r) => setRoundLocked(r.locked === 'true')).catch(() => {})
        return
      }
      if (!navigator.onLine || isRetryableError(err)) {
        queueScores({ scores: scoreItems })
        setPendingSync(true)
        navigate('/registrations')
        return
      }
      setSaveError(err.message || 'Failed to save. Please retry.')
      return
    }
  }

  async function handleConfirmSubmit() {
    setIsSaving(true)
    try {
      await submitDirtyScores()
    } finally {
      setIsSaving(false)
      setShowConfirm(false)
    }
  }

  async function handleGridSubmit() {
    setIsSaving(true)
    setSaveError(null)
    try {
      await submitDirtyScores()
    } finally {
      setIsSaving(false)
    }
  }

  async function resolveConflict(keepMine) {
    if (conflictQueue.length === 0) return
    const [current, ...rest] = conflictQueue
    const { holeId, strokes, serverStrokes, serverVersion, source } = current

    if (keepMine) {
      // Force-save without version check
      setIsSaving(true)
      try {
        const res = await api.post('/scores/', {
          scores: [{ registration_id: registrationId, round_id: activeRoundId, hole_id: holeId, strokes }],
        })
        const saved = res?.scores?.[0]
        setScoreVersions((v) => ({ ...v, [holeId]: saved ? saved.version : (serverVersion || 1) + 1 }))
        clearDirty(holeId)
        removeQueuedScore(registrationId, activeRoundId, holeId)
      } catch (err) {
        setSaveError(err.message || 'Failed to save.')
      } finally {
        setIsSaving(false)
      }
    } else {
      // Accept server value
      setScores((s) => ({ ...s, [holeId]: serverStrokes }))
      setScoreVersions((v) => ({ ...v, [holeId]: serverVersion }))
      clearDirty(holeId)
      removeQueuedScore(registrationId, activeRoundId, holeId)
    }

    if (source === 'needs_review') {
      removeNeedsReview(registrationId, activeRoundId, holeId)
    }

    if (rest.length > 0) {
      setConflictQueue(rest)
      return
    }
    setConflictQueue([])
    const after = afterConflicts
    setAfterConflicts(null)
    if (after?.navigateAfter) {
      navigate('/registrations')
    } else if (after?.single) {
      if (after.isLast) navigate('/registrations')
      else setCurrentHoleIndex((i) => i + 1)
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
  const par = pars[holeId] ?? null
  const score = typeof scores[holeId] === 'number' ? scores[holeId] : null
  const MIN_SCORE = 1
  const MAX_SCORE = 20
  const isFirst = currentHoleIndex === 0
  const isLast = currentHoleIndex === holes.length - 1
  const badge = parLabel(score, par)

  // Totals for the confirmation screen — only scored holes count, so an
  // unscored hole never silently contributes a par value to the total.
  const scoredHoles = holes.filter((h) => typeof scores[h.hole_id] === 'number')
  const unscoredCount = holes.length - scoredHoles.length
  const totalStrokes = scoredHoles.reduce((sum, h) => sum + scores[h.hole_id], 0)
  const totalPar = scoredHoles.reduce((sum, h) => sum + (pars[h.hole_id] ?? 0), 0)
  const totalVsPar = totalPar > 0 ? totalStrokes - totalPar : null

  function decrementScore() {
    if (score === null || score <= MIN_SCORE) return
    setScores((s) => ({ ...s, [holeId]: score - 1 }))
    markDirty(holeId)
    setSaveError(null)
  }

  function incrementScore() {
    if (score === null) {
      // First tap on an unscored hole starts at par (or 1 if par isn't set).
      setScores((s) => ({ ...s, [holeId]: typeof par === 'number' ? par : MIN_SCORE }))
      markDirty(holeId)
      setSaveError(null)
      return
    }
    if (score >= MAX_SCORE) return
    setScores((s) => ({ ...s, [holeId]: score + 1 }))
    markDirty(holeId)
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

  async function goToNext() {
    setSaveError(null)
    if (currentHoleIndex < holes.length - 1) {
      if (score === null) {
        setSaveError('Enter a score before moving on.')
        return
      }
      setIsSaving(true)
      await saveScore(holeId, score, false)
      setIsSaving(false)
    }
  }

  // Conflict dialog
  if (conflictQueue.length > 0) {
    const current = conflictQueue[0]
    return (
      <div className="bg-forest min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
          <h2 className="font-display font-black text-xl text-gray-900">Score Conflict</h2>
          <p className="text-gray-600 text-sm">
            Another admin updated this score to <strong>{current.serverStrokes}</strong>.
            Your value is <strong>{current.strokes}</strong>.
          </p>
          {conflictQueue.length > 1 && (
            <p className="text-xs text-gray-400">
              {conflictQueue.length - 1} more conflict{conflictQueue.length - 1 !== 1 ? 's' : ''} to resolve after this.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => resolveConflict(true)}
              className="bg-forest text-white font-bold py-3 rounded-xl active:scale-95 transition-transform"
            >
              Keep mine ({current.strokes})
            </button>
            <button
              onClick={() => resolveConflict(false)}
              className="bg-silver text-gray-700 font-bold py-3 rounded-xl active:scale-95 transition-transform"
            >
              Use theirs ({current.serverStrokes})
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation screen
  if (showConfirm) {
    return (
      <div className="bg-forest min-h-screen text-white pb-10">
        <div className="px-6 pt-4">
          <button
            onClick={() => setShowConfirm(false)}
            className="text-white/80 font-semibold text-sm hover:text-white"
          >
            ← Back to scorecard
          </button>
        </div>
        <div className="px-6 pt-4">
          <h1 className="font-display font-black text-2xl text-white">Review Your Round</h1>
          <p className="text-white/60 text-sm mt-1">{tournamentName}</p>
        </div>

        {saveError && (
          <div className="mx-6 mt-3">
            <p className="bg-[#CC0131] text-white text-sm font-semibold py-2 px-3 rounded-lg text-center">{saveError}</p>
          </div>
        )}

        {unscoredCount > 0 && (
          <div className="mx-6 mt-3">
            <p className="bg-yellow text-gray-900 text-sm font-semibold py-2 px-3 rounded-lg text-center">
              {unscoredCount} hole{unscoredCount !== 1 ? 's' : ''} have no score — you can still complete the round; they just won't be submitted.
            </p>
          </div>
        )}

        <div className="mx-6 mt-4 bg-white rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-forest text-white text-xs">
                <th className="px-3 py-2 text-left font-semibold">Hole</th>
                <th className="px-3 py-2 text-center font-semibold">Par</th>
                <th className="px-3 py-2 text-center font-semibold">Score</th>
                <th className="px-3 py-2 text-center font-semibold">+/-</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((h) => {
                const hp = pars[h.hole_id] ?? null
                const hs = typeof scores[h.hole_id] === 'number' ? scores[h.hole_id] : null
                const hbadge = parLabel(hs, hp)
                return (
                  <tr key={h.hole_id} className="border-b border-silver last:border-b-0">
                    <td className="px-3 py-2 font-bold text-gray-900">{h.hole_number}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{hp ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-bold text-gray-900">{hs ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {hbadge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${hbadge.cls}`}>
                          {hbadge.text}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold text-gray-900">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-center text-gray-500">{totalPar || '—'}</td>
                <td className="px-3 py-2 text-center">{totalStrokes || '—'}</td>
                <td className="px-3 py-2 text-center text-sm font-bold">
                  {totalVsPar !== null
                    ? totalVsPar === 0 ? 'E' : totalVsPar > 0 ? `+${totalVsPar}` : totalVsPar
                    : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mx-6 mt-6">
          <button
            onClick={handleConfirmSubmit}
            disabled={isSaving}
            className="w-full bg-white text-gray-900 font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {isSaving ? <span className="flex items-center justify-center gap-2"><Spinner className="h-5 w-5" /> Submitting…</span> : 'Confirm & Submit Round'}
          </button>
        </div>
      </div>
    )
  }

  const activeRound = allRounds.find((r) => r.round_id === activeRoundId)
  const roundLabel = activeRound ? (activeRound.label || `Round ${activeRound.round_number}`) : ''

  return (
    <div className="bg-forest min-h-screen text-white pb-10">
      {/* Pending sync banner */}
      {pendingSync && (
        <div className="bg-yellow px-4 py-2 text-center text-gray-900 text-xs font-semibold">
          ⚠ Scores pending sync — will upload when connected
        </div>
      )}

      {/* Round locked banner */}
      {roundLocked && (
        <div className="bg-[#CC0131] px-4 py-2 text-center text-white text-xs font-semibold">
          🔒 This round is locked — scores cannot be submitted
        </div>
      )}

      {/* Back link */}
      <div className="px-6 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 font-semibold text-sm hover:text-white"
        >
          ← Back
        </button>
      </div>

      {/* Tournament name + view mode toggle */}
      <div className="px-6 pt-2 flex items-center justify-between">
        <p className="text-xl font-semibold text-white">{tournamentName}</p>
        <button
          onClick={() => setViewMode((m) => m === 'stepper' ? 'grid' : 'stepper')}
          className="text-white/70 text-xs font-semibold border border-white/30 rounded-lg px-3 py-1 hover:text-white transition-colors"
        >
          {viewMode === 'stepper' ? '⊞ Grid' : '◆ Hole'}
        </button>
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
        {viewMode === 'stepper' && (
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
        )}
      </div>

      {/* --- GRID MODE --- */}
      {viewMode === 'grid' && (
        <div className="px-6 mt-4">
          <p className="text-lg font-display font-black text-white mb-3">{roundLabel}</p>
          <ScoreGrid holes={holes} pars={pars} scores={scores} onScoreChange={handleGridScoreChange} />
          {saveError && (
            <p className="mt-3 bg-[#CC0131] text-white text-sm font-semibold py-2 px-3 rounded-lg text-center">
              {saveError}
            </p>
          )}
          <button
            onClick={handleGridSubmit}
            disabled={isSaving || roundLocked}
            className="mt-4 w-full bg-white text-gray-900 font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {isSaving ? <span className="flex items-center justify-center gap-2"><Spinner className="h-5 w-5" /> Saving…</span> : 'Submit All Scores'}
          </button>
        </div>
      )}

      {/* --- STEPPER MODE --- */}
      {viewMode === 'stepper' && (
        <>
          {/* Round / Hole / Par display */}
          <div className="px-6 mt-4 text-center">
            <p className="text-2xl font-display font-black text-white">
              {roundLabel} | Hole: {currentHole.hole_number}
            </p>
            <p className="text-base font-semibold text-white/70 mt-1">Par: {par ?? 'Not Set'}</p>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="mx-6 mt-3">
              <p className="w-full bg-[#CC0131] text-white text-sm font-semibold py-2 px-3 rounded-lg text-center">
                {saveError}
              </p>
            </div>
          )}

          {/* Score display card */}
          <div className="bg-white rounded-2xl mx-6 mt-4 py-8 text-center">
            <span className="font-display font-black text-7xl text-gray-900">{score ?? '—'}</span>
            {badge && (
              <div className="mt-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${badge.cls}`}>
                  {badge.text}
                </span>
              </div>
            )}
          </div>

          {/* Stepper buttons */}
          <div className="mx-6 mt-4 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={decrementScore}
              disabled={score === null || score <= MIN_SCORE}
              style={{ backgroundColor: '#f0fdf4' }}
              className="h-44 rounded-2xl flex items-center justify-center text-6xl font-black text-gray-900 cursor-pointer active:scale-95 transition-transform disabled:opacity-40"
              aria-label="Decrease"
            >
              −
            </button>
            <button
              type="button"
              onClick={incrementScore}
              disabled={score !== null && score >= MAX_SCORE}
              style={{ backgroundColor: '#fef2f2' }}
              className="h-44 rounded-2xl flex items-center justify-center text-6xl font-black text-gray-900 cursor-pointer active:scale-95 transition-transform disabled:opacity-40"
              aria-label="Increase"
            >
              +
            </button>
          </div>

          {/* Save button */}
          <div className="mx-6 mt-4">
            <button
              onClick={handleSave}
              disabled={isSaving || roundLocked}
              className="w-full bg-white text-gray-900 font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {isSaving ? <span className="flex items-center justify-center gap-2"><Spinner className="h-5 w-5" /> Saving…</span> : isLast ? 'Review & Complete Round' : 'Save'}
            </button>
          </div>

          {/* Back / Next navigation */}
          <div className="mx-6 mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={goToPrev}
              className="bg-forest border border-white/50 text-white/90 rounded-xl py-3 text-sm font-semibold text-center cursor-pointer hover:opacity-90 transition-opacity"
            >
              {isFirst ? '← Back' : '← Prev Hole'}
            </button>
            <button
              onClick={goToNext}
              disabled={isLast || isSaving}
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
        </>
      )}
    </div>
  )
}
