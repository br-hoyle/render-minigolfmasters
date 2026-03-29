import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const STATUS_FILTER_OPTIONS = ['All', 'Upcoming', 'Active', 'Complete']

export default function Dashboard() {
  useEffect(() => {
    document.title = 'Admin | Mini Golf Masters'
  }, [])

  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newT, setNewT] = useState({ name: '', start_date: '', end_date: '', entry_fee: '' })
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    api.get('/tournaments/').then((ts) => {
      setTournaments(ts)
      setLoading(false)
    })
  }, [])

  async function handleCreateTournament(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const t = await api.post('/tournaments/', newT)
      setDialogOpen(false)
      navigate(`/admin/tournaments/${t.tournament_id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteTournament(tournamentId, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await api.delete(`/tournaments/${tournamentId}`)
    setTournaments((ts) => ts.filter((t) => t.tournament_id !== tournamentId))
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'All' || t.status.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
        ← Home
      </Link>

      {/* Title */}
      <h1 className="font-display font-black text-4xl text-gray-900">Admin Portal</h1>

      {/* Quick nav buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/admin/users"
          className="bg-forest text-white rounded-xl py-8 font-semibold text-center text-lg hover:bg-emerald transition-colors"
        >
          Manage Users
        </Link>
        <Link
          to="/admin/courses"
          className="bg-forest text-white rounded-xl py-8 font-semibold text-center text-lg hover:bg-emerald transition-colors"
        >
          Manage Courses
        </Link>
      </div>

      {/* Tournaments section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-2xl text-gray-900">Tournaments</h2>
          <button
            onClick={() => setDialogOpen(true)}
            className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors"
          >
            + New
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
        />

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
                statusFilter === opt
                  ? 'bg-forest text-white'
                  : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {filteredTournaments.length === 0 && (
          <p className="text-gray-500 text-sm">No tournaments found.</p>
        )}

        <div className="space-y-3">
          {filteredTournaments.map((t) => (
            <div key={t.tournament_id} className="bg-white rounded-xl border border-silver p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/admin/tournaments/${t.tournament_id}`}
                  className="flex-1 min-w-0"
                >
                  <p className="font-bold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {t.status} | {fmtDate(t.start_date)} - {fmtDate(t.end_date)}
                    {t.entry_fee ? ` | Fee: $${Math.round(Number(t.entry_fee))}` : ''}
                  </p>
                </Link>
                <button
                  onClick={() => handleDeleteTournament(t.tournament_id, t.name)}
                  className="text-xs font-bold text-[#CC0131] hover:underline shrink-0"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* New Tournament Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="New Tournament">
        <form onSubmit={handleCreateTournament} className="space-y-4">
          {[
            { name: 'name', label: 'Name', type: 'text' },
            { name: 'start_date', label: 'Start Date', type: 'date' },
            { name: 'end_date', label: 'End Date', type: 'date' },
            { name: 'entry_fee', label: 'Entry Fee (optional)', type: 'number' },
          ].map(({ name, label, type }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                name={name}
                value={newT[name]}
                onChange={(e) => setNewT((f) => ({ ...f, [name]: e.target.value }))}
                required={name !== 'entry_fee'}
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-forest text-white font-semibold py-3 rounded-lg disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create Tournament'}
          </button>
        </form>
      </Dialog>
    </div>
  )
}
