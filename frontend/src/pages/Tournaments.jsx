import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Banner from '../components/Banner'
import LoadingOverlay from '../components/LoadingOverlay'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const FILTER_OPTIONS = ['All', 'Upcoming', 'Active', 'Complete']

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

export default function Tournaments() {
  useEffect(() => {
    document.title = 'Tournaments | Mini Golf Masters'
  }, [])

  const navigate = useNavigate()
  const { user } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [rounds, setRounds] = useState([])
  const [myRegs, setMyRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { search: locationSearch } = useLocation()
  const initialFilter = useMemo(() => {
    const param = new URLSearchParams(locationSearch).get('filter') || ''
    return FILTER_OPTIONS.includes(param) ? param : 'All'
  }, [locationSearch])
  const [filter, setFilter] = useState(initialFilter)

  useEffect(() => {
    async function load() {
      const calls = [api.get('/tournaments/'), api.get('/rounds/')]
      if (user) calls.push(api.get('/registrations/'))
      const [ts, rs, regs] = await Promise.all(calls)
      setTournaments(ts)
      setRounds(rs)
      setMyRegs(regs || [])
      setLoading(false)
    }
    load()
  }, [user])

  // Build a map of tournament_id -> round count
  const roundCountMap = useMemo(() => {
    const map = {}
    rounds.forEach((r) => {
      map[r.tournament_id] = (map[r.tournament_id] || 0) + 1
    })
    return map
  }, [rounds])

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Upcoming' && t.status === 'upcoming') ||
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
          <h1 className="font-display font-black text-3xl text-gray-900">Tournaments</h1>
          <p className="text-sm text-gray-500 mt-1">The full schedule — every tee time, trophy, and every grudge match.</p>
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
          {filtered.map((t) => {
            const roundCount = roundCountMap[t.tournament_id] || 0
            const isClickable = t.status === 'active' || t.status === 'complete'
            const myReg = myRegs.find(
              (r) =>
                r.tournament_id === t.tournament_id &&
                r.status !== 'forfeit' &&
                r.status !== 'rejected'
            )
            const canAddScores =
              !!myReg &&
              t.status === 'active' &&
              (myReg.status === 'accepted' || user?.role === 'admin')

            return (
              <div
                key={t.tournament_id}
                onClick={() => navigate(`/tournaments/${t.tournament_id}`)}
                className="bg-white rounded-xl border border-silver p-4 flex items-start justify-between gap-3 cursor-pointer hover:border-forest transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {t.status} | {fmtDate(t.start_date)} - {fmtDate(t.end_date)}
                    {t.entry_fee ? ` | Fee: $${Math.round(Number(t.entry_fee))}` : ''}
                  </p>
                  {roundCount > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">Rounds: {roundCount}</p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col gap-2 items-end">
                  <Link
                    to={`/tournaments/${t.tournament_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors block text-center"
                  >
                    View
                  </Link>
                  {canAddScores && (
                    <Link
                      to={`/scorecard/${myReg.registration_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-emerald text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-forest transition-colors block text-center"
                    >
                      + Add Scores
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
