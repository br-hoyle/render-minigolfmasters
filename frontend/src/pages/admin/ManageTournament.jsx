import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

function fmtDateTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const REG_FILTER_OPTIONS = ['All', 'Pending', 'Accepted', 'Waitlisted', 'Forfeit']

const STATUS_PILL = {
  upcoming: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald/20 text-emerald',
  complete: 'bg-silver text-gray-500',
}

const EMPTY_FORM = {
  name: '',
  start_date: '',
  end_date: '',
  entry_fee: '',
  max_players: '',
  registration_deadline: '',
}

export default function ManageTournament() {
  useEffect(() => {
    document.title = 'Manage Tournament | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const isNew = tournamentId === 'new'

  const [original, setOriginal] = useState(EMPTY_FORM)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tournamentStatus, setTournamentStatus] = useState('')
  const [rounds, setRounds] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [users, setUsers] = useState([])
  const [allCourses, setAllCourses] = useState([])
  const [roundForm, setRoundForm] = useState({ course_id: '', round_number: '', label: '' })
  const [showAddRound, setShowAddRound] = useState(false)
  const [addingRound, setAddingRound] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('rounds')
  const [regFilter, setRegFilter] = useState('All')
  const [regSearch, setRegSearch] = useState('')
  const [regSortOrder, setRegSortOrder] = useState('newest')

  // Bulk registration state
  const [selectedRegIds, setSelectedRegIds] = useState(new Set())
  const [bulkConfirmAction, setBulkConfirmAction] = useState(null) // 'accept' | 'reject' | null
  const [bulkLoading, setBulkLoading] = useState(false)

  // Add user dialog state
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [addUserSelected, setAddUserSelected] = useState('')
  const [addUserLoading, setAddUserLoading] = useState(false)

  // Round lock state
  const [lockingRound, setLockingRound] = useState(null)

  // Announce state
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceForm, setAnnounceForm] = useState({ subject: '', message: '' })
  const [announcing, setAnnouncing] = useState(false)
  const [announceResult, setAnnounceResult] = useState(null)

  // Scores tab state
  const [scoreRegId, setScoreRegId] = useState('')
  const [scoreRoundId, setScoreRoundId] = useState('')
  const [scoreHoles, setScoreHoles] = useState([])
  const [scorePars, setScorePars] = useState({})
  const [scoreEdits, setScoreEdits] = useState({})
  const [scoreOriginal, setScoreOriginal] = useState({})
  const [scoreIds, setScoreIds] = useState({})         // hole_id -> score_id
  const [scoreModifiers, setScoreModifiers] = useState({}) // hole_id -> last_modified_by
  const [scoreLoading, setScoreLoading] = useState(false)
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [scoreSaved, setScoreSaved] = useState(false)

  // Score audit dialog
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditData, setAuditData] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditHoleNumber, setAuditHoleNumber] = useState(null)

  const isDirty = JSON.stringify(form) !== JSON.stringify(original)

  useEffect(() => {
    if (isNew) return
    async function load() {
      const [t, rs, regs, us, cs] = await Promise.all([
        api.get(`/tournaments/${tournamentId}`),
        api.get(`/rounds/?tournament_id=${tournamentId}`),
        api.get(`/registrations/?tournament_id=${tournamentId}`),
        api.get('/users/'),
        api.get('/courses/'),
      ])
      const formData = {
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        entry_fee: t.entry_fee || '',
        max_players: t.max_players || '',
        registration_deadline: t.registration_deadline || '',
      }
      setOriginal(formData)
      setForm(formData)
      setTournamentStatus(t.status)
      setRounds(rs)
      setRegistrations(regs)
      setUsers(us)
      setAllCourses(cs)
      setLoading(false)
    }
    load()
  }, [tournamentId, isNew])

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleDiscard() {
    setForm(original)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isNew) {
        const t = await api.post('/tournaments/', form)
        navigate(`/admin/tournaments/${t.tournament_id}`, { replace: true })
      } else {
        const t = await api.patch(`/tournaments/${tournamentId}`, form)
        setOriginal(form)
        setTournamentStatus(t.status)
      }
    } finally {
      setSaving(false)
    }
  }

  async function updateRegStatus(regId, status) {
    if (status === 'forfeit' && !confirm('Forfeit this registration?')) return
    await api.patch(`/registrations/${regId}`, { status })
    setRegistrations((rs) => rs.map((r) => (r.registration_id === regId ? { ...r, status } : r)))
  }

  async function handleBulkAction(action) {
    if (!selectedRegIds.size) return
    setBulkLoading(true)
    try {
      const status = action === 'accept' ? 'accepted' : 'rejected'
      await api.patch('/registrations/bulk', {
        registration_ids: [...selectedRegIds],
        status,
      })
      setRegistrations((rs) =>
        rs.map((r) => (selectedRegIds.has(r.registration_id) ? { ...r, status } : r))
      )
      setSelectedRegIds(new Set())
      setBulkConfirmAction(null)
    } catch (err) {
      alert(err.message || 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleAddUser(e) {
    e.preventDefault()
    if (!addUserSelected) return
    setAddUserLoading(true)
    try {
      const reg = await api.post('/registrations/admin', {
        tournament_id: tournamentId,
        user_id: addUserSelected,
      })
      setRegistrations((rs) => [reg, ...rs])
      setAddUserOpen(false)
      setAddUserSelected('')
    } catch (err) {
      alert(err.message || 'Failed to add user')
    } finally {
      setAddUserLoading(false)
    }
  }

  function toggleRegSelection(regId) {
    setSelectedRegIds((prev) => {
      const next = new Set(prev)
      if (next.has(regId)) next.delete(regId)
      else next.add(regId)
      return next
    })
  }

  async function handleAddRound(e) {
    e.preventDefault()
    if (!roundForm.course_id || !roundForm.round_number || !roundForm.label) return
    setAddingRound(true)
    try {
      const round = await api.post('/rounds/', {
        tournament_id: tournamentId,
        course_id: roundForm.course_id,
        round_number: parseInt(roundForm.round_number),
        label: roundForm.label,
      })
      setRounds((rs) => [...rs, round])
      setRoundForm({ course_id: '', round_number: '', label: '' })
      setShowAddRound(false)
    } finally {
      setAddingRound(false)
    }
  }

  async function handleRemoveRound(roundId) {
    if (!confirm('Remove this round?')) return
    await api.delete(`/rounds/${roundId}`)
    setRounds((rs) => rs.filter((r) => r.round_id !== roundId))
  }

  async function handleToggleLock(round) {
    const currentlyLocked = round.locked === 'true'
    setLockingRound(round.round_id)
    try {
      const updated = await api.patch(`/rounds/${round.round_id}/lock`, { locked: !currentlyLocked })
      setRounds((rs) => rs.map((r) => (r.round_id === round.round_id ? { ...r, locked: updated.locked } : r)))
    } finally {
      setLockingRound(null)
    }
  }

  async function handleAnnounce(e) {
    e.preventDefault()
    setAnnouncing(true)
    setAnnounceResult(null)
    try {
      const result = await api.post(`/tournaments/${tournamentId}/announce`, announceForm)
      setAnnounceResult(result)
      setAnnounceForm({ subject: '', message: '' })
    } catch (err) {
      alert(err.message || 'Failed to send announcement')
    } finally {
      setAnnouncing(false)
    }
  }

  // Load holes + existing scores whenever player or round selection changes
  useEffect(() => {
    if (!scoreRegId || !scoreRoundId) return
    async function loadScores() {
      setScoreLoading(true)
      setScoreError(null)
      setScoreSaved(false)
      try {
        const round = rounds.find((r) => r.round_id === scoreRoundId)
        if (!round) return

        const tournament = await api.get(`/tournaments/${tournamentId}`)
        const [holes, parsForDate, existingScores] = await Promise.all([
          api.get(`/courses/${round.course_id}/holes`),
          api.get(`/pars/?tournament_start_date=${tournament.start_date}`),
          api.get(`/scores/?registration_id=${scoreRegId}`),
        ])

        let resolvedPars = parsForDate
        if (resolvedPars.length === 0) {
          const allPars = await api.get('/pars/')
          resolvedPars = allPars.filter((p) => String(p.active_to).slice(0, 10) === '9999-12-31')
        }
        const parMap = Object.fromEntries(resolvedPars.map((p) => [p.hole_id, Number(p.par_strokes)]))

        const roundScores = existingScores.filter((s) => s.round_id === scoreRoundId)
        const scoreMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, Number(s.strokes)]))
        const scoreIdMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, s.score_id]))
        const modifierMap = Object.fromEntries(roundScores.map((s) => [s.hole_id, s.last_modified_by]))

        const sorted = holes.sort((a, b) => a.hole_number - b.hole_number)
        const initial = {}
        sorted.forEach((h) => {
          initial[h.hole_id] = scoreMap[h.hole_id] ?? parMap[h.hole_id] ?? 3
        })

        setScoreHoles(sorted)
        setScorePars(parMap)
        setScoreEdits(initial)
        setScoreOriginal(initial)
        setScoreIds(scoreIdMap)
        setScoreModifiers(modifierMap)
      } catch (err) {
        setScoreError(err.message || 'Failed to load scores')
      } finally {
        setScoreLoading(false)
      }
    }
    loadScores()
  }, [scoreRegId, scoreRoundId])

  async function handleSaveScores() {
    setScoreSaving(true)
    setScoreError(null)
    setScoreSaved(false)
    try {
      const scoresList = scoreHoles.map((h) => ({
        registration_id: scoreRegId,
        round_id: scoreRoundId,
        hole_id: h.hole_id,
        strokes: Number(scoreEdits[h.hole_id]) || 0,
      }))
      await api.post('/scores/', { scores: scoresList })
      setScoreOriginal({ ...scoreEdits })
      setScoreSaved(true)
      setTimeout(() => setScoreSaved(false), 3000)
    } catch (err) {
      setScoreError(err.message || 'Failed to save scores')
    } finally {
      setScoreSaving(false)
    }
  }

  function handleDiscardScores() {
    setScoreEdits({ ...scoreOriginal })
    setScoreError(null)
    setScoreSaved(false)
  }

  async function openAuditDialog(holeId, holeNumber) {
    const scoreId = scoreIds[holeId]
    if (!scoreId) return
    setAuditHoleNumber(holeNumber)
    setAuditData([])
    setAuditOpen(true)
    setAuditLoading(true)
    try {
      const logs = await api.get(`/scores/${scoreId}/audit`)
      setAuditData(logs)
    } catch {
      // silently fail
    } finally {
      setAuditLoading(false)
    }
  }

  const isScoreDirty = JSON.stringify(scoreEdits) !== JSON.stringify(scoreOriginal)

  function userName(userId) {
    const u = users.find((u) => u.user_id === userId)
    return u ? `${u.first_name} ${u.last_name}` : userId
  }

  function courseName(courseId) {
    const c = allCourses.find((c) => c.course_id === courseId)
    return c ? c.name : courseId
  }

  const selectedPlayerUserId = registrations.find((r) => r.registration_id === scoreRegId)?.user_id

  const filteredRegs = registrations
    .filter((reg) => {
      const name = userName(reg.user_id).toLowerCase()
      const matchesSearch = !regSearch || name.includes(regSearch.toLowerCase())
      const matchesFilter =
        regFilter === 'All' ||
        (regFilter === 'Pending' && reg.status === 'in_review') ||
        (regFilter === 'Accepted' && reg.status === 'accepted') ||
        (regFilter === 'Waitlisted' && reg.status === 'waitlisted') ||
        (regFilter === 'Forfeit' && reg.status === 'forfeit')
      return matchesSearch && matchesFilter
    })
    .sort((a, b) => {
      const aTime = new Date(a.submitted_at || 0).getTime()
      const bTime = new Date(b.submitted_at || 0).getTime()
      return regSortOrder === 'newest' ? bTime - aTime : aTime - bTime
    })

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const statusPillClass = STATUS_PILL[tournamentStatus] || 'bg-silver text-gray-500'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/admin" className="text-forest font-semibold text-sm hover:underline block">
        ← Portal
      </Link>

      {/* Title + Announce button */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-black text-4xl text-gray-900">
          {isNew ? 'New Tournament' : 'Manage Tournament'}
        </h1>
        {!isNew && (
          <button
            onClick={() => { setAnnounceOpen(true); setAnnounceResult(null) }}
            className="shrink-0 bg-[#FBF50D] text-gray-900 font-semibold text-sm px-4 py-2 rounded-full hover:opacity-80 transition-opacity"
          >
            Announce
          </button>
        )}
      </div>

      {/* Tournament details card — always editable */}
      <form onSubmit={handleSave}>
        <div className="bg-white rounded-xl border border-silver p-4 space-y-4">
          {/* Header row: label + status pill */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 font-medium">Tournament Details</p>
            {!isNew && tournamentStatus && (
              <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize cursor-default ${statusPillClass}`}>
                {tournamentStatus}
              </span>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Tournament name"
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          {/* Start + End date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                className="w-full border border-silver rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                required
                className="w-full border border-silver rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
          </div>

          {/* Entry fee + Max players */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entry Fee</label>
              <input
                type="number"
                name="entry_fee"
                value={form.entry_fee}
                onChange={handleChange}
                placeholder="Optional"
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Players</label>
              <input
                type="number"
                name="max_players"
                value={form.max_players}
                onChange={handleChange}
                placeholder="Unlimited"
                min="1"
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
          </div>

          {/* Registration Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Registration Deadline</label>
            <input
              type="date"
              name="registration_deadline"
              value={form.registration_deadline}
              onChange={handleChange}
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          {/* Save/Cancel — only when dirty */}
          {isDirty && (
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-forest text-white font-semibold py-2.5 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60 text-sm"
              >
                {saving ? 'Saving…' : isNew ? 'Create Tournament' : 'Save Changes'}
              </button>
              {!isNew && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex-1 border border-silver text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* View Leaderboard link */}
      {!isNew && (
        <Link
          to={`/leaderboard/${tournamentId}`}
          className="block w-full text-center bg-forest border border-forest text-white font-semibold py-2.5 rounded-xl hover:bg-[#079E78] transition-colors text-sm"
        >
          View Leaderboard
        </Link>
      )}

      {/* Rounds + Registrations + Scores tabs */}
      {!isNew && (
        <section className="space-y-4">
          {/* Tab bar */}
          <div className="flex border border-silver rounded-xl overflow-hidden">
            {['rounds', 'registrations', 'scores'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors ${
                  activeTab === tab ? 'bg-forest text-white' : 'bg-white text-gray-600 hover:bg-cream'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Rounds tab */}
          {activeTab === 'rounds' && (
            <div className="space-y-3">
              {rounds.length === 0 && !showAddRound && (
                <p className="text-gray-500 text-sm">No rounds added yet.</p>
              )}

              {rounds.map((r) => {
                const isLocked = r.locked === 'true'
                return (
                  <div key={r.round_id} className="bg-white rounded-xl border border-silver p-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">Round {r.round_number}</p>
                        {isLocked && (
                          <span className="text-xs font-bold bg-[#CC0131]/10 text-[#CC0131] px-2 py-0.5 rounded-full">
                            Locked
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{r.label || ''} — {courseName(r.course_id)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleLock(r)}
                        disabled={lockingRound === r.round_id}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors disabled:opacity-60 ${
                          isLocked
                            ? 'bg-[#079E78] text-white hover:opacity-80'
                            : 'border border-silver text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {lockingRound === r.round_id ? '…' : isLocked ? 'Unlock' : 'Lock'}
                      </button>
                      <Link
                        to={`/admin/tournaments/${tournamentId}/rounds/${r.round_id}/scores`}
                        className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors"
                      >
                        Scores
                      </Link>
                      <button
                        onClick={() => handleRemoveRound(r.round_id)}
                        className="text-xs font-bold text-[#CC0131] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Add Round — hidden behind button */}
              {showAddRound ? (
                <form onSubmit={handleAddRound} className="bg-white rounded-xl border border-silver p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-forest">Add Round</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Course</label>
                    <select
                      value={roundForm.course_id}
                      onChange={(e) => setRoundForm((f) => ({ ...f, course_id: e.target.value }))}
                      required
                      className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                    >
                      <option value="">Select a course…</option>
                      {allCourses.map((c) => (
                        <option key={c.course_id} value={c.course_id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Round #</label>
                      <input
                        type="number"
                        min="1"
                        value={roundForm.round_number}
                        onChange={(e) => setRoundForm((f) => ({ ...f, round_number: e.target.value }))}
                        required
                        className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Course A – Round 1"
                        value={roundForm.label}
                        onChange={(e) => setRoundForm((f) => ({ ...f, label: e.target.value }))}
                        required
                        className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={addingRound}
                      className="flex-1 bg-forest text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-emerald transition-colors"
                    >
                      {addingRound ? 'Adding…' : 'Add Round'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddRound(false)}
                      className="flex-1 border border-silver text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddRound(true)}
                  className="w-full bg-forest text-white font-semibold py-4 rounded-xl text-sm hover:bg-emerald transition-colors"
                >
                  + Add Round
                </button>
              )}
            </div>
          )}

          {/* Scores tab */}
          {activeTab === 'scores' && (
            <div className="space-y-4">
              {/* Player + Round selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Player</label>
                  <select
                    value={scoreRegId}
                    onChange={(e) => { setScoreRegId(e.target.value); setScoreHoles([]) }}
                    className="w-full border border-silver rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                  >
                    <option value="">Select player…</option>
                    {registrations
                      .filter((r) => r.status === 'accepted' || r.status === 'forfeit')
                      .map((r) => (
                        <option key={r.registration_id} value={r.registration_id}>
                          {userName(r.user_id)}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Round</label>
                  <select
                    value={scoreRoundId}
                    onChange={(e) => { setScoreRoundId(e.target.value); setScoreHoles([]) }}
                    className="w-full border border-silver rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                  >
                    <option value="">Select round…</option>
                    {rounds.map((r) => (
                      <option key={r.round_id} value={r.round_id}>
                        {r.label || `Round ${r.round_number}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(!scoreRegId || !scoreRoundId) && (
                <p className="text-gray-400 text-sm text-center py-4">Select a player and round to edit scores.</p>
              )}

              {scoreLoading && <p className="text-gray-400 text-sm text-center py-4">Loading…</p>}
              {scoreError && <p className="text-[#CC0131] text-sm">{scoreError}</p>}

              {/* Hole score inputs */}
              {!scoreLoading && scoreHoles.length > 0 && (
                <div className="bg-white rounded-xl border border-silver overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-forest text-white text-xs">
                        <th className="px-4 py-2 text-left font-semibold">Hole</th>
                        <th className="px-4 py-2 text-center font-semibold">Par</th>
                        <th className="px-4 py-2 text-center font-semibold">Score</th>
                        <th className="px-2 py-2 text-center font-semibold w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreHoles.map((h) => {
                        const isAdminOverride =
                          scoreModifiers[h.hole_id] &&
                          scoreModifiers[h.hole_id] !== selectedPlayerUserId
                        return (
                          <tr key={h.hole_id} className="border-t border-silver">
                            <td className="px-4 py-2 font-semibold text-gray-800">#{h.hole_number}</td>
                            <td className="px-4 py-2 text-center text-gray-500">{scorePars[h.hole_id] ?? '—'}</td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setScoreEdits((e) => ({ ...e, [h.hole_id]: Math.max(1, (e[h.hole_id] || 1) - 1) }))}
                                  className="w-7 h-7 rounded-full bg-silver text-gray-700 font-bold text-sm flex items-center justify-center hover:bg-gray-300 transition-colors"
                                >−</button>
                                <span className="font-bold text-gray-900 w-6 text-center">
                                  {scoreEdits[h.hole_id] ?? '—'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setScoreEdits((e) => ({ ...e, [h.hole_id]: Math.min(20, (e[h.hole_id] || 1) + 1) }))}
                                  className="w-7 h-7 rounded-full bg-silver text-gray-700 font-bold text-sm flex items-center justify-center hover:bg-gray-300 transition-colors"
                                >+</button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {isAdminOverride && scoreIds[h.hole_id] && (
                                <button
                                  onClick={() => openAuditDialog(h.hole_id, h.hole_number)}
                                  title="View audit log"
                                  className="text-gray-400 hover:text-forest text-xs"
                                >
                                  ⊙
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!scoreLoading && scoreHoles.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveScores}
                    disabled={scoreSaving || !isScoreDirty}
                    className="flex-1 bg-forest text-white font-semibold py-3 rounded-xl text-sm hover:bg-emerald transition-colors disabled:opacity-50"
                  >
                    {scoreSaving ? 'Saving…' : 'Save Scores'}
                  </button>
                  <button
                    onClick={handleDiscardScores}
                    disabled={!isScoreDirty}
                    className="flex-1 border border-silver text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Discard
                  </button>
                </div>
              )}

              {scoreSaved && (
                <p className="text-emerald text-sm font-semibold text-center">Scores saved!</p>
              )}
            </div>
          )}

          {/* Registrations tab */}
          {activeTab === 'registrations' && (
            <div className="space-y-3">
              <button
                onClick={() => { setAddUserOpen(true); setAddUserSelected('') }}
                className="w-full bg-forest text-white font-semibold text-sm py-2 rounded-full hover:bg-emerald transition-colors"
              >
                + Add Registration
              </button>
              <input
                type="text"
                placeholder="Search by name..."
                value={regSearch}
                onChange={(e) => setRegSearch(e.target.value)}
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />

              {/* Filter pills + sort toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap flex-1">
                  {REG_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRegFilter(opt)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                        regFilter === opt
                          ? 'bg-forest text-white'
                          : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setRegSortOrder((o) => (o === 'newest' ? 'oldest' : 'newest'))}
                  className="text-xs font-semibold text-forest hover:underline shrink-0"
                >
                  {regSortOrder === 'newest' ? 'Oldest first' : 'Newest first'}
                </button>
              </div>

              {/* Bulk action bar */}
              {selectedRegIds.size > 0 && (
                <div className="flex items-center gap-2 bg-[#FBF50D] rounded-xl px-4 py-3">
                  <span className="text-sm font-bold text-gray-800 flex-1">
                    {selectedRegIds.size} selected
                  </span>
                  <button
                    onClick={() => setBulkConfirmAction('accept')}
                    className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full hover:bg-emerald transition-colors"
                  >
                    Accept Selected
                  </button>
                  <button
                    onClick={() => setBulkConfirmAction('reject')}
                    className="text-xs font-bold border border-gray-600 text-gray-700 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    Reject Selected
                  </button>
                  <button
                    onClick={() => setSelectedRegIds(new Set())}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
              )}

              {filteredRegs.length === 0 && (
                <p className="text-gray-500 text-sm">No registrations found.</p>
              )}

              {filteredRegs.map((reg) => {
                const isSelected = selectedRegIds.has(reg.registration_id)
                const statusColor = {
                  in_review: 'text-gray-500',
                  accepted: 'text-[#079E78]',
                  rejected: 'text-[#CC0131]',
                  waitlisted: 'text-yellow-600',
                  forfeit: 'text-[#CC0131]',
                }[reg.status] || 'text-gray-500'

                return (
                  <div
                    key={reg.registration_id}
                    className={`bg-white rounded-xl border p-4 flex items-center gap-3 transition-colors ${
                      isSelected ? 'border-forest bg-forest/5' : 'border-silver'
                    }`}
                  >
                    {/* Checkbox (only for in_review and waitlisted) */}
                    {(reg.status === 'in_review' || reg.status === 'waitlisted') && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRegSelection(reg.registration_id)}
                        className="h-4 w-4 rounded border-gray-300 accent-forest shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{userName(reg.user_id)}</p>
                      <p className={`text-sm italic capitalize ${statusColor}`}>
                        {reg.status === 'in_review' ? 'pending' : reg.status}
                      </p>
                      {reg.submitted_at && (
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(reg.submitted_at)}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {reg.status === 'in_review' && (
                        <>
                          <button
                            onClick={() => updateRegStatus(reg.registration_id, 'accepted')}
                            className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full hover:bg-emerald transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => updateRegStatus(reg.registration_id, 'rejected')}
                            className="text-xs font-bold border border-silver text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {reg.status === 'waitlisted' && (
                        <>
                          <button
                            onClick={() => updateRegStatus(reg.registration_id, 'accepted')}
                            className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full hover:bg-emerald transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => updateRegStatus(reg.registration_id, 'rejected')}
                            className="text-xs font-bold border border-silver text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {reg.status === 'accepted' && (
                        <button
                          onClick={() => updateRegStatus(reg.registration_id, 'forfeit')}
                          className="text-xs font-bold bg-[#CC0131] text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                        >
                          Forfeit
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onClose={() => setAddUserOpen(false)} title="Add User to Tournament">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Player</label>
            <select
              value={addUserSelected}
              onChange={(e) => setAddUserSelected(e.target.value)}
              required
              className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest bg-white"
            >
              <option value="">Select a player…</option>
              {users
                .filter((u) => u.status === 'active' && !registrations.some((r) => r.user_id === u.user_id))
                .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                .map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">The user will be added as accepted and can submit scores immediately.</p>
          <button
            type="submit"
            disabled={addUserLoading || !addUserSelected}
            className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-emerald transition-colors"
          >
            {addUserLoading ? 'Adding…' : 'Add to Tournament'}
          </button>
        </form>
      </Dialog>

      {/* Bulk action confirmation Dialog */}
      <Dialog
        open={!!bulkConfirmAction}
        onClose={() => setBulkConfirmAction(null)}
        title={bulkConfirmAction === 'accept' ? 'Accept Selected?' : 'Reject Selected?'}
      >
        <p className="text-sm text-gray-600 mb-6">
          {bulkConfirmAction === 'accept'
            ? `Accept ${selectedRegIds.size} registration${selectedRegIds.size !== 1 ? 's' : ''}?`
            : `Reject ${selectedRegIds.size} registration${selectedRegIds.size !== 1 ? 's' : ''}?`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleBulkAction(bulkConfirmAction)}
            disabled={bulkLoading}
            className={`flex-1 font-semibold py-3 rounded-xl text-sm disabled:opacity-60 ${
              bulkConfirmAction === 'accept'
                ? 'bg-forest text-white hover:bg-emerald'
                : 'bg-[#CC0131] text-white hover:opacity-90'
            }`}
          >
            {bulkLoading ? 'Processing…' : 'Confirm'}
          </button>
          <button
            onClick={() => setBulkConfirmAction(null)}
            className="flex-1 border border-silver text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </Dialog>

      {/* Announce Dialog */}
      <Dialog
        open={announceOpen}
        onClose={() => { setAnnounceOpen(false); setAnnounceResult(null) }}
        title="Announce to Players"
      >
        {announceResult ? (
          <div className="text-center space-y-4">
            <p className="text-[#079E78] font-bold text-lg">Sent!</p>
            <p className="text-sm text-gray-600">
              Message delivered to {announceResult.sent} player{announceResult.sent !== 1 ? 's' : ''}.
            </p>
            <button
              onClick={() => { setAnnounceOpen(false); setAnnounceResult(null) }}
              className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleAnnounce} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={announceForm.subject}
                onChange={(e) => setAnnounceForm((f) => ({ ...f, subject: e.target.value }))}
                required
                placeholder="e.g. Tournament Update"
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                rows={5}
                value={announceForm.message}
                onChange={(e) => setAnnounceForm((f) => ({ ...f, message: e.target.value }))}
                required
                placeholder="Your announcement…"
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest resize-none"
              />
            </div>
            <p className="text-xs text-gray-400">
              Sends to all accepted registrants for this tournament.
            </p>
            <button
              type="submit"
              disabled={announcing}
              className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-emerald transition-colors"
            >
              {announcing ? 'Sending…' : 'Send Announcement'}
            </button>
          </form>
        )}
      </Dialog>

      {/* Score audit Dialog */}
      <Dialog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        title={`Score History — Hole ${auditHoleNumber ?? ''}`}
      >
        {auditLoading ? (
          <p className="text-center text-gray-400 text-sm py-4">Loading…</p>
        ) : auditData.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">No audit history found.</p>
        ) : (
          <div className="space-y-2">
            {auditData.map((log) => (
              <div key={log.audit_id} className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                <p className="font-semibold text-gray-700">
                  {log.previous_strokes} → {log.new_strokes} strokes
                </p>
                <p className="text-gray-500">
                  By {log.modified_by} · {new Date(log.modified_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  )
}
