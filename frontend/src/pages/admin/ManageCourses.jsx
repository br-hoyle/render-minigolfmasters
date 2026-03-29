import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'

export default function ManageCourses() {
  useEffect(() => {
    document.title = 'Manage Courses | Mini Golf Masters'
  }, [])

  const [courses, setCourses] = useState([])
  const [allPars, setAllPars] = useState([])
  const [courseHoles, setCourseHoles] = useState({})       // { course_id: Hole[] }
  const [expandedId, setExpandedId] = useState(null)
  const [loadingHoles, setLoadingHoles] = useState({})     // { course_id: bool }
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Course dialog/edit state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', address: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [editCourseForm, setEditCourseForm] = useState({})

  // Hole edit/par state
  const [editingHoleId, setEditingHoleId] = useState(null)
  const [editHoleNumber, setEditHoleNumber] = useState('')
  const [editingParHoleId, setEditingParHoleId] = useState(null)
  const [editParValue, setEditParValue] = useState('')
  const [newHoleNumbers, setNewHoleNumbers] = useState({}) // { course_id: number }

  useEffect(() => {
    Promise.all([api.get('/courses/'), api.get('/pars/')]).then(([cs, ps]) => {
      setCourses(cs)
      setAllPars(ps)
      setLoading(false)
    })
  }, [])

  function currentPar(holeId) {
    const p = allPars.find((p) => p.hole_id === holeId && p.active_to === '9999-12-31')
    return p ? p.par_strokes : null
  }

  async function toggleExpand(courseId) {
    if (expandedId === courseId) {
      setExpandedId(null)
      return
    }
    setExpandedId(courseId)
    if (!courseHoles[courseId]) {
      setLoadingHoles((l) => ({ ...l, [courseId]: true }))
      try {
        const holes = await api.get(`/courses/${courseId}/holes`)
        const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number)
        setCourseHoles((h) => ({ ...h, [courseId]: sorted }))
      } finally {
        setLoadingHoles((l) => ({ ...l, [courseId]: false }))
      }
    }
  }

  // ── Course CRUD ──────────────────────────────────────────────────────────

  async function handleCreateCourse(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const course = await api.post('/courses/', newCourse)
      setCourses((cs) => [...cs, course])
      setNewCourse({ name: '', address: '', description: '' })
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateCourse(courseId) {
    setSaving(true)
    try {
      const updated = await api.patch(`/courses/${courseId}`, editCourseForm)
      setCourses((cs) => cs.map((c) => (c.course_id === courseId ? updated : c)))
      setEditingCourseId(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCourse(courseId) {
    if (!confirm('Delete this course? This cannot be undone.')) return
    await api.delete(`/courses/${courseId}`)
    setCourses((cs) => cs.filter((c) => c.course_id !== courseId))
    if (expandedId === courseId) setExpandedId(null)
  }

  // ── Hole CRUD ────────────────────────────────────────────────────────────

  async function handleAddHole(courseId) {
    const num = newHoleNumbers[courseId]
    if (!num) return
    const hole = await api.post('/courses/holes', { course_id: courseId, hole_number: parseInt(num) })
    setCourseHoles((h) => {
      const updated = [...(h[courseId] || []), hole].sort((a, b) => a.hole_number - b.hole_number)
      return { ...h, [courseId]: updated }
    })
    setNewHoleNumbers((n) => ({ ...n, [courseId]: '' }))
  }

  async function handleUpdateHole(holeId, courseId) {
    const updated = await api.patch(`/courses/holes/${holeId}`, { hole_number: parseInt(editHoleNumber) })
    setCourseHoles((h) => {
      const updated_list = (h[courseId] || [])
        .map((hole) => (hole.hole_id === holeId ? updated : hole))
        .sort((a, b) => a.hole_number - b.hole_number)
      return { ...h, [courseId]: updated_list }
    })
    setEditingHoleId(null)
  }

  async function handleDeleteHole(holeId, courseId) {
    if (!confirm('Delete this hole? Any associated pars will remain in history.')) return
    await api.delete(`/courses/holes/${holeId}`)
    setCourseHoles((h) => ({
      ...h,
      [courseId]: (h[courseId] || []).filter((hole) => hole.hole_id !== holeId),
    }))
  }

  // ── Par management ───────────────────────────────────────────────────────

  async function handleSetPar(holeId) {
    if (!editParValue) return
    const par = await api.post('/pars/', {
      hole_id: holeId,
      par_strokes: parseInt(editParValue),
    })
    setAllPars((ps) => {
      const closed = ps.map((p) =>
        p.hole_id === holeId && p.active_to === '9999-12-31' ? { ...p, active_to: par.active_from } : p
      )
      return [...closed, par]
    })
    setEditingParHoleId(null)
    setEditParValue('')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const filteredCourses = courses.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q)
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/admin" className="text-forest font-semibold text-sm hover:underline block">
        ← Portal
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-black text-4xl text-gray-900">Courses</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors shrink-0"
        >
          + Add Course
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by Name or Address..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
      />

      {/* Course list */}
      <section className="space-y-3">
        {filteredCourses.length === 0 && <p className="text-gray-500 text-sm">No courses found.</p>}
        {filteredCourses.map((c) => {
          const holeCount = courseHoles[c.course_id]?.length ?? null
          const isExpanded = expandedId === c.course_id

          return (
            <div key={c.course_id} className="bg-white rounded-xl border border-silver overflow-hidden">
              {/* Course header row */}
              {editingCourseId === c.course_id ? (
                <div className="p-4 space-y-3">
                  {[
                    { name: 'name', label: 'Name' },
                    { name: 'address', label: 'Address' },
                    { name: 'description', label: 'Description' },
                  ].map(({ name, label }) => (
                    <div key={name}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                      <input
                        type="text"
                        value={editCourseForm[name] || ''}
                        onChange={(e) => setEditCourseForm((f) => ({ ...f, [name]: e.target.value }))}
                        className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateCourse(c.course_id)}
                      disabled={saving}
                      className="flex-1 bg-forest text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingCourseId(null)}
                      className="flex-1 border border-silver text-gray-700 font-semibold py-2 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex items-start justify-between gap-2">
                  <button
                    onClick={() => toggleExpand(c.course_id)}
                    className="flex-1 text-left"
                  >
                    <p className="font-bold text-lg text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.address || 'No address'}
                      {holeCount !== null ? ` | Holes: ${holeCount}` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => {
                        setEditingCourseId(c.course_id)
                        setEditCourseForm({ name: c.name, address: c.address || '', description: c.description || '' })
                      }}
                      className="text-xs font-bold text-forest hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(c.course_id)}
                      className="text-xs font-bold text-[#CC0131] hover:underline"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => toggleExpand(c.course_id)}
                      className="text-gray-400 text-sm"
                    >
                      {isExpanded ? '∧' : '∨'}
                    </button>
                  </div>
                </div>
              )}

              {/* Holes section */}
              {isExpanded && (
                <div className="border-t border-silver">
                  {loadingHoles[c.course_id] ? (
                    <div className="p-4 text-xs text-gray-400">Loading holes…</div>
                  ) : (
                    <>
                      {(courseHoles[c.course_id] || []).length === 0 && (
                        <div className="px-4 py-3 text-xs text-gray-400">No holes yet.</div>
                      )}

                      {(courseHoles[c.course_id] || []).map((hole) => (
                        <div key={hole.hole_id} className="px-4 py-3 flex items-center border-b border-silver last:border-b-0">
                          {editingHoleId === hole.hole_id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xs text-gray-500 w-12 shrink-0">Hole #</span>
                              <input
                                type="number"
                                min="1"
                                value={editHoleNumber}
                                onChange={(e) => setEditHoleNumber(e.target.value)}
                                className="w-16 border border-silver rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                              />
                              <button
                                onClick={() => handleUpdateHole(hole.hole_id, c.course_id)}
                                className="text-xs font-bold text-forest hover:underline"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingHoleId(null)}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : editingParHoleId === hole.hole_id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-bold w-20">Hole #{hole.hole_number}</span>
                              <span className="text-xs text-gray-500">Par:</span>
                              <input
                                type="number"
                                min="1"
                                max="9"
                                value={editParValue}
                                onChange={(e) => setEditParValue(e.target.value)}
                                className="w-14 border border-silver rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                              />
                              <button
                                onClick={() => handleSetPar(hole.hole_id)}
                                className="text-xs font-bold text-forest hover:underline"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingParHoleId(null)}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between flex-1">
                              <div className="flex items-center gap-4">
                                <span className="font-bold w-20">Hole #{hole.hole_number}</span>
                                <span className="text-xs text-gray-600">
                                  Par: <strong>{currentPar(hole.hole_id) ?? '—'}</strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <button
                                  onClick={() => {
                                    setEditingParHoleId(hole.hole_id)
                                    setEditParValue(currentPar(hole.hole_id) ?? '')
                                    setEditingHoleId(null)
                                  }}
                                  className="text-xs font-bold text-forest hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteHole(hole.hole_id, c.course_id)}
                                  className="text-xs font-bold text-[#CC0131] hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add hole row */}
                      <div className="p-4 flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-14 shrink-0">Hole #</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="e.g. 1"
                          value={newHoleNumbers[c.course_id] || ''}
                          onChange={(e) =>
                            setNewHoleNumbers((n) => ({ ...n, [c.course_id]: e.target.value }))
                          }
                          className="w-20 border border-silver rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                        />
                        <button
                          onClick={() => handleAddHole(c.course_id)}
                          disabled={!newHoleNumbers[c.course_id]}
                          className="bg-forest text-white font-semibold text-sm px-6 py-2 rounded-xl disabled:opacity-40 hover:bg-emerald transition-colors"
                        >
                          + Hole
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* Add Course Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Add Course">
        <form onSubmit={handleCreateCourse} className="space-y-4">
          {[
            { name: 'name', label: 'Name', required: true },
            { name: 'address', label: 'Address' },
            { name: 'description', label: 'Description' },
          ].map(({ name, label, required }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={newCourse[name]}
                onChange={(e) => setNewCourse((c) => ({ ...c, [name]: e.target.value }))}
                required={required}
                className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-forest text-white font-semibold py-3 rounded-lg disabled:opacity-60"
          >
            {saving ? 'Adding…' : 'Add Course'}
          </button>
        </form>
      </Dialog>
    </div>
  )
}
