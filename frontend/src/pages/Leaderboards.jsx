import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Banner from '../components/Banner'
import LoadingOverlay from '../components/LoadingOverlay'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const FILTER_OPTIONS = ['All', 'Active', 'Complete']

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
        active
          ? 'bg-forest text-white'
          : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

export default function Leaderboards() {
  useEffect(() => {
    document.title = 'Leaderboards | Mini Golf Masters'
  }, [])

  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    async function load() {
      const ts = await api.get('/tournaments/')
      // Only show active + complete
      setTournaments(ts.filter((t) => t.status === 'active' || t.status === 'complete'))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Active' && t.status === 'active') ||
        (filter === 'Complete' && t.status === 'complete')
      return matchesSearch && matchesFilter
    })
  }, [tournaments, search, filter])

  if (loading) {
    return <LoadingOverlay />
  }

  return (
    <div>
      <Banner />
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
          ← Home
        </Link>
        <div>
          <h1 className="font-display font-black text-3xl text-gray-900">Leaderboards</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your score. Their score. The score you're not talking about. All right here.
          </p>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search tournaments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest bg-white"
        />

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <FilterPill
              key={opt}
              label={opt}
              active={filter === opt}
              onClick={() => setFilter(opt)}
            />
          ))}
        </div>

        {/* Tournament cards */}
        {filtered.length === 0 && (
          <p className="text-gray-400 text-sm">No tournaments found.</p>
        )}

        <div className="space-y-3">
          {filtered.map((t) => (
            <div
              key={t.tournament_id}
              className="bg-white rounded-xl border border-silver p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {t.status} | {fmtDate(t.start_date)} - {fmtDate(t.end_date)}
                </p>
              </div>
              <div className="shrink-0">
                <Link
                  to={`/leaderboard/${t.tournament_id}`}
                  className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors block text-center"
                >
                  View Leaderboard
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
