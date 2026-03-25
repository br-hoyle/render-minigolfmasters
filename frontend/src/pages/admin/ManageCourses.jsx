import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function ManageCourses() {
  useEffect(() => {
    document.title = 'Manage Courses | Mini Golf Masters'
  }, [])

  const [courses, setCourses] = useState([])
  const [newCourse, setNewCourse] = useState({ name: '', address: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/courses/').then((cs) => {
      setCourses(cs)
      setLoading(false)
    })
  }, [])

  async function handleCreateCourse(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const course = await api.post('/courses/', newCourse)
      setCourses((cs) => [...cs, course])
      setNewCourse({ name: '', address: '', description: '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">Manage Courses</h1>

      {/* Create course */}
      <form onSubmit={handleCreateCourse} className="space-y-4 bg-white rounded-xl p-4 shadow-sm">
        <h2 className="font-display font-bold text-lg text-forest">Add Course</h2>
        {[
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'address', label: 'Address', type: 'text' },
          { name: 'description', label: 'Description', type: 'text' },
        ].map(({ name, label, type, required }) => (
          <div key={name}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type}
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
          className="bg-forest text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-60"
        >
          {saving ? 'Adding…' : 'Add Course'}
        </button>
      </form>

      {/* Course list */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-xl text-forest">Courses</h2>
        {courses.length === 0 && <p className="text-gray-500 text-sm">No courses yet.</p>}
        {courses.map((c) => (
          <div key={c.course_id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="font-display font-bold text-forest">{c.name}</div>
            {c.address && <div className="text-xs text-gray-400">{c.address}</div>}
          </div>
        ))}
      </section>
    </div>
  )
}
