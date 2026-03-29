import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../api/client'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const REG_FILTER_OPTIONS = ['All', 'Pending', 'Accepted', 'Forfeit']

const STATUS_PILL = {
  upcoming: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald/20 text-emerald',
  complete: 'bg-silver text-gray-500',
}

export default function ManageTournament() {
  useEffect(() => {
    document.title = 'Manage Tournament | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const isNew = tournamentId === 'new'

  const [original, setOriginal] = useState({ name: '', start_date: '', end_date: '', entry_fee: '' })
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', entry_fee: '' })
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

  // Scores tab state
  const [scoreRegId, setScoreRegId] = useState('')
  const [scoreRoundId, setScoreRoundId] = useState('')
  const [scoreHoles, setScoreHoles] = useState([])
  const [scorePars, setScorePars] = useState({})
  const [scoreEdits, setScoreEdits] = useState({})   // hole_id -> strokes (working copy)
  const [scoreOriginal, setScoreOriginal] = useState({}) // hole_id -> strokes (saved)
  const [scoreLoading, setScoreLoading] = useState(false)
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [scoreSaved, setScoreSaved] = useState(false)

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
      const formData = { name: t.name, start_date: t.start_date, end_date: t.end_date, entry_fee: t.entry_fee || '' }
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

        const sorted = holes.sort((a, b) => a.hole_number - b.hole_number)
        const initial = {}
        sorted.forEach((h) => {
          initial[h.hole_id] = scoreMap[h.hole_id] ?? parMap[h.hole_id] ?? 3
        })

        setScoreHoles(sorted)
        setScorePars(parMap)
        setScoreEdits(initial)
        setScoreOriginal(initial)
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

  const isScoreDirty = JSON.stringify(scoreEdits) !== JSON.stringify(scoreOriginal)

  function userName(userId) {
    const u = users.find((u) => u.user_id === userId)
    return u ? `${u.first_name} ${u.last_name}` : userId
  }

  function courseName(courseId) {
    const c = allCourses.find((c) => c.course_id === courseId)
    return c ? c.name : courseId
  }

  const filteredRegs = registrations.filter((reg) => {
    const name = userName(reg.user_id).toLowerCase()
    const matchesSearch = !regSearch || name.includes(regSearch.toLowerCase())
    const matchesFilter =
      regFilter === 'All' ||
      (regFilter === 'Pending' && reg.status === 'in_review') ||
      (regFilter === 'Accepted' && reg.status === 'accepted') ||
      (regFilter === 'Forfeit' && reg.status === 'forfeit')
    return matchesSearch && matchesFilter
  })

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const statusPillClass = STATUS_PILL[tournamentStatus] || 'bg-silver text-gray-500'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/admin" className="text-forest font-semibold text-sm hover:underline block">
        ← Portal
      </Link>

      {/* Title */}
      <h1 className="font-display font-black text-4xl text-gray-900">
        {isNew ? 'New Tournament' : 'Manage Tournament'}
      </h1>

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

          {/* Entry fee */}
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

      {/* Rounds + Registrations tabs */}
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

              {rounds.map((r) => (
                <div key={r.round_id} className="bg-white rounded-xl border border-silver p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900">Round {r.round_number}</p>
                    <p className="text-sm text-gray-500">{courseName(r.course_id)}</p>
                  </div>
                  <div className="flex items-center gap-3">
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
              ))}

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

              {/* Prompt to select both */}
              {(!scoreRegId || !scoreRoundId) && (
                <p className="text-gray-400 text-sm text-center py-4">Select a player and round to edit scores.</p>
              )}

              {scoreLoading && (
                <p className="text-gray-400 text-sm text-center py-4">Loading…</p>
              )}

              {scoreError && (
                <p className="text-[#CC0131] text-sm">{scoreError}</p>
              )}

              {/* Hole score inputs */}
              {!scoreLoading && scoreHoles.length > 0 && (
                <div className="bg-white rounded-xl border border-silver overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-forest text-white text-xs">
                        <th className="px-4 py-2 text-left font-semibold">Hole</th>
                        <th className="px-4 py-2 text-center font-semibold">Par</th>
                        <th className="px-4 py-2 text-center font-semibold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreHoles.map((h) => (
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Save / Discard */}
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
              <input
                type="text"
                placeholder="Search by name..."
                value={regSearch}
                onChange={(e) => setRegSearch(e.target.value)}
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />

              <div className="flex gap-2 flex-wrap">
                {REG_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setRegFilter(opt)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
                      regFilter === opt
                        ? 'bg-forest text-white'
                        : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {filteredRegs.length === 0 && (
                <p className="text-gray-500 text-sm">No registrations found.</p>
              )}

              {filteredRegs.map((reg) => (
                <div key={reg.registration_id} className="bg-white rounded-xl border border-silver p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-900">{userName(reg.user_id)}</p>
                    <p className="text-sm text-gray-500 italic capitalize">
                      {reg.status === 'in_review' ? 'pending' : reg.status}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {reg.status === 'in_review' && (
                      <button
                        onClick={() => updateRegStatus(reg.registration_id, 'accepted')}
                        className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full hover:bg-emerald transition-colors"
                      >
                        Accept
                      </button>
                    )}
                    {reg.status === 'in_review' && (
                      <button
                        onClick={() => updateRegStatus(reg.registration_id, 'rejected')}
                        className="text-xs font-bold border border-silver text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
                      >
                        Reject
                      </button>
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
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
