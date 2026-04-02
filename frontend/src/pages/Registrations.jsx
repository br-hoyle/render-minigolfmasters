import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Banner from '../components/Banner'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const REG_STATUS_CONFIG = {
  in_review: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  accepted: { label: 'Accepted', cls: 'bg-forest text-white' },
  rejected: { label: 'Rejected', cls: 'bg-gray-100 text-gray-600' },
  forfeit: { label: 'Forfeit', cls: 'bg-[#CC0131] text-white' },
}

const REG_FILTER_OPTIONS = ['All', 'Pending', 'Accepted', 'Forfeit']

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

export default function Registrations() {
  useEffect(() => {
    document.title = 'Registrations | Mini Golf Masters'
  }, [])

  const { user } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [myRegs, setMyRegs] = useState([])
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(null)
  const [regFilter, setRegFilter] = useState('All')

  useEffect(() => {
    async function load() {
      const [ts, regs, rs] = await Promise.all([
        api.get('/tournaments/'),
        api.get('/registrations/'),
        api.get('/rounds/'),
      ])
      setTournaments(ts)
      setMyRegs(regs.filter((r) => r.user_id === user.user_id))
      setRounds(rs)
      setLoading(false)
    }
    load()
  }, [])

  const roundCountMap = useMemo(() => {
    const map = {}
    rounds.forEach((r) => {
      map[r.tournament_id] = (map[r.tournament_id] || 0) + 1
    })
    return map
  }, [rounds])

  async function register(tournamentId) {
    setRegistering(tournamentId)
    try {
      const reg = await api.post('/registrations/', { tournament_id: tournamentId })
      setMyRegs((r) => [...r, reg])
    } finally {
      setRegistering(null)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading…</div>
  }

  const filterMap = {
    All: () => true,
    Pending: (r) => r.status === 'in_review',
    Accepted: (r) => r.status === 'accepted',
    Forfeit: (r) => r.status === 'forfeit',
  }
  const filteredRegs = myRegs.filter(filterMap[regFilter] || (() => true))

  const myTournamentIds = new Set(myRegs.map((r) => r.tournament_id))
  const upcomingNotRegistered = tournaments.filter(
    (t) => t.status === 'upcoming' && !myTournamentIds.has(t.tournament_id)
  )

  return (
    <div>
      <Banner />
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
          ← Home
        </Link>
        <div>
          <h1 className="font-display font-black text-3xl text-gray-900">Registrations</h1>
          <p className="text-sm text-gray-500 mt-1">The Field Is Set. Are You In?</p>
        </div>

        {/* My Registrations */}
        <section className="space-y-3">
          <div>
            <h2 className="font-display font-bold text-xl text-gray-900">My Registrations</h2>
            <p className="text-xs text-gray-500 italic mt-0.5">
              Your name is on the list. Get ready to putt.
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 flex-wrap">
            {REG_FILTER_OPTIONS.map((opt) => (
              <FilterPill
                key={opt}
                label={opt}
                active={regFilter === opt}
                onClick={() => setRegFilter(opt)}
              />
            ))}
          </div>

          {filteredRegs.length === 0 && (
            <p className="text-gray-400 text-sm">No registrations found.</p>
          )}

          {filteredRegs.map((reg) => {
            const t = tournaments.find((x) => x.tournament_id === reg.tournament_id)
            if (!t) return null
            const statusConfig = REG_STATUS_CONFIG[reg.status] || { label: reg.status, cls: 'bg-gray-100 text-gray-600' }
            const roundCount = roundCountMap[t.tournament_id] || 0
            return (
              <div key={reg.registration_id} className="bg-white rounded-xl border border-silver p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {t.status} | {fmtDate(t.start_date)} - {fmtDate(t.end_date)}
                    {t.entry_fee ? ` | Fee: $${Math.round(Number(t.entry_fee))}` : ''}
                  </p>
                  {roundCount > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">Rounds: {roundCount}</p>
                  )}
                  {reg.status === 'accepted' && t.status === 'active' && (
                    <Link
                      to={`/scorecard/${reg.registration_id}`}
                      className="inline-block mt-2 text-xs font-bold bg-emerald text-white px-3 py-1.5 rounded-full"
                    >
                      Add Scores →
                    </Link>
                  )}
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${statusConfig.cls}`}>
                  {statusConfig.label}
                </span>
              </div>
            )
          })}
        </section>

        {/* Upcoming Tournaments not yet registered */}
        {upcomingNotRegistered.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="font-display font-bold text-xl text-gray-900">Upcoming Tournaments</h2>
              <p className="text-xs text-gray-500 italic mt-0.5">
                Contact us to get your name on the list before someone else takes your spot.
              </p>
            </div>
            {upcomingNotRegistered.map((t) => {
              const roundCount = roundCountMap[t.tournament_id] || 0
              return (
                <div key={t.tournament_id} className="bg-white rounded-xl border border-silver p-4 flex items-start justify-between gap-3">
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
                  <button
                    onClick={() => register(t.tournament_id)}
                    disabled={registering === t.tournament_id}
                    className="shrink-0 bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors disabled:opacity-60"
                  >
                    {registering === t.tournament_id ? 'Registering…' : 'Register'}
                  </button>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
