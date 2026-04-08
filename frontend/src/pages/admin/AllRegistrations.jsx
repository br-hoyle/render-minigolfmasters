import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import LoadingOverlay from '../../components/LoadingOverlay'

const STATUS_LABELS = {
  in_review: 'In Review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  forfeit: 'Forfeit',
}

const STATUS_OPTIONS = [
  { value: 'in_review',  label: 'In Review' },
  { value: 'accepted',   label: 'Accepted' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected',   label: 'Rejected' },
  { value: 'forfeit',    label: 'Forfeit' },
]

function StatusBadge({ status }) {
  const styles = {
    in_review:  'bg-gray-100 text-gray-600',
    accepted:   'bg-[#079E78]/15 text-[#079E78]',
    waitlisted: 'bg-[#FBF50D] text-gray-800',
    rejected:   'bg-red-50 text-[#CC0131]',
    forfeit:    'bg-gray-100 text-gray-400 line-through',
  }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function StatusMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(value) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  function clearAll() {
    onChange(new Set())
    setOpen(false)
  }

  // Build button label
  let buttonLabel
  if (selected.size === 0) {
    buttonLabel = 'All Statuses'
  } else if (selected.size <= 2) {
    buttonLabel = [...selected].map((v) => STATUS_LABELS[v] ?? v).join(', ')
  } else {
    buttonLabel = `${selected.size} statuses`
  }

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-silver rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-forest"
      >
        <span className={selected.size > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}>
          {buttonLabel}
        </span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-silver shadow-lg z-20 py-1">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-cream"
            >
              <input
                type="checkbox"
                checked={selected.has(value)}
                onChange={() => toggle(value)}
                className="w-4 h-4 rounded accent-forest cursor-pointer"
              />
              <StatusBadge status={value} />
            </label>
          ))}
          {selected.size > 0 && (
            <>
              <hr className="border-silver mx-3 my-1" />
              <button
                onClick={clearAll}
                className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-cream"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

export default function AllRegistrations() {
  useEffect(() => { document.title = 'Registrations | Mini Golf Masters' }, [])

  const [registrations, setRegistrations] = useState([])
  const [tournaments, setTournaments] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [tournamentFilter, setTournamentFilter] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(new Set())
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    Promise.all([
      api.get('/registrations/'),
      api.get('/tournaments/'),
      api.get('/users/'),
    ]).then(([regs, ts, us]) => {
      setRegistrations(regs)
      setTournaments(ts)
      setUsers(us)
      setLoading(false)
    })
  }, [])

  const userMap = useMemo(() => {
    const m = {}
    users.forEach((u) => { m[u.user_id] = u })
    return m
  }, [users])

  const tournamentMap = useMemo(() => {
    const m = {}
    tournaments.forEach((t) => { m[t.tournament_id] = t })
    return m
  }, [tournaments])

  const sortedTournaments = useMemo(
    () => [...tournaments].sort((a, b) => a.name.localeCompare(b.name)),
    [tournaments]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return registrations
      .filter((reg) => {
        const user = userMap[reg.user_id]
        if (!user) return false
        if (q) {
          const name = `${user.first_name} ${user.last_name}`.toLowerCase()
          if (!name.includes(q) && !(user.email || '').toLowerCase().includes(q)) return false
        }
        if (tournamentFilter && reg.tournament_id !== tournamentFilter) return false
        if (selectedStatuses.size > 0 && !selectedStatuses.has(reg.status)) return false
        return true
      })
      .sort((a, b) => {
        const aT = new Date(a.submitted_at).getTime() || 0
        const bT = new Date(b.submitted_at).getTime() || 0
        return sortDir === 'desc' ? bT - aT : aT - bT
      })
  }, [registrations, userMap, search, tournamentFilter, selectedStatuses, sortDir])

  if (loading) return <LoadingOverlay />

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Back */}
      <Link to="/admin" className="text-forest font-semibold text-sm hover:underline block">
        ← Portal
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-display font-black text-4xl text-gray-900">Registrations</h1>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-silver text-gray-600">
          {filtered.length}
        </span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
      />

      {/* Tournament filter */}
      <select
        value={tournamentFilter}
        onChange={(e) => setTournamentFilter(e.target.value)}
        className="w-full border border-silver rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest bg-white"
      >
        <option value="">All Tournaments</option>
        {sortedTournaments.map((t) => (
          <option key={t.tournament_id} value={t.tournament_id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Status multi-select + sort row */}
      <div className="flex items-center gap-2">
        <StatusMultiSelect selected={selectedStatuses} onChange={setSelectedStatuses} />
        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="text-xs font-semibold px-3 py-3 rounded-xl border border-silver text-forest hover:bg-gray-50 whitespace-nowrap shrink-0"
        >
          {sortDir === 'desc' ? 'Newest ↓' : 'Oldest ↑'}
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 && (
        <p className="text-gray-500 text-sm py-4">No registrations match your filters.</p>
      )}

      <div className="space-y-3">
        {filtered.map((reg) => {
          const user = userMap[reg.user_id]
          const tournament = tournamentMap[reg.tournament_id]
          if (!user) return null
          return (
            <div
              key={reg.registration_id}
              className="bg-white rounded-xl border border-silver p-4 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-gray-900">
                  {user.first_name} {user.last_name}
                </p>
                <StatusBadge status={reg.status} />
              </div>
              {tournament && (
                <p className="text-xs text-gray-500 font-medium">{tournament.name}</p>
              )}
              <p className="text-xs text-gray-400 italic">
                Registered {fmtDate(reg.submitted_at)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
