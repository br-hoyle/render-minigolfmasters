import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

const STATUS_LABEL = {
  upcoming: { label: 'Upcoming', cls: 'bg-yellow text-forest' },
  active: { label: 'Active', cls: 'bg-[#079E78] text-white' },
  complete: { label: 'Complete', cls: 'bg-silver text-gray-600' },
}

const REG_STATUS_LABEL = {
  in_review: 'In Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  forfeit: 'Forfeit',
}

export default function Tournaments() {
  useEffect(() => {
    document.title = 'Tournaments | Mini Golf Masters'
  }, [])

  const { user } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [myRegs, setMyRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(null)

  useEffect(() => {
    async function load() {
      const [ts, regs] = await Promise.all([
        api.get('/tournaments/'),
        user ? api.get('/registrations/') : Promise.resolve([]),
      ])
      setTournaments(ts)
      setMyRegs(regs)
      setLoading(false)
    }
    load()
  }, [user])

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

  const myRegMap = Object.fromEntries(myRegs.map((r) => [r.tournament_id, r]))

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">Tournaments</h1>

      <section className="space-y-3">
        {tournaments.length === 0 && (
          <p className="text-gray-500 text-sm">No tournaments yet.</p>
        )}
        {tournaments.map((t) => {
          const badge = STATUS_LABEL[t.status] || {}
          const myReg = myRegMap[t.tournament_id]
          return (
            <div key={t.tournament_id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display font-bold text-lg text-forest">{t.name}</div>
                  <div className="text-xs text-gray-400">
                    {t.start_date} — {t.end_date}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Link
                  to={`/leaderboard/${t.tournament_id}`}
                  className="text-xs font-semibold text-forest underline underline-offset-2"
                >
                  Leaderboard
                </Link>

                {user && !myReg && t.status === 'upcoming' && (
                  <button
                    onClick={() => register(t.tournament_id)}
                    disabled={registering === t.tournament_id}
                    className="text-xs font-semibold text-white bg-forest px-3 py-1 rounded-full disabled:opacity-60"
                  >
                    {registering === t.tournament_id ? 'Registering…' : 'Register'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* My Registrations */}
      {user && myRegs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-bold text-xl text-forest">My Registrations</h2>
          {myRegs.map((reg) => {
            const t = tournaments.find((x) => x.tournament_id === reg.tournament_id)
            if (!t) return null
            return (
              <div key={reg.registration_id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="font-display font-semibold text-forest">{t.name}</div>
                  <span className="text-xs text-gray-500">{REG_STATUS_LABEL[reg.status]}</span>
                </div>
                {reg.status === 'accepted' && t.status === 'active' && (
                  <Link
                    to={`/tournaments/${t.tournament_id}/rounds`}
                    className="inline-block text-xs font-bold bg-[#079E78] text-white px-3 py-1.5 rounded-full"
                  >
                    Add Scores →
                  </Link>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
