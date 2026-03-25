import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'

export default function Dashboard() {
  useEffect(() => {
    document.title = 'Admin | Mini Golf Masters'
  }, [])

  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/tournaments/').then((ts) => {
      setTournaments(ts)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-3">
        {[
          { to: '/admin/users', label: 'Manage Users', icon: '👥' },
          { to: '/admin/courses', label: 'Manage Courses', icon: '🏌️' },
        ].map(({ to, label, icon }) => (
          <Link
            key={to}
            to={to}
            className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
          >
            <span className="text-3xl">{icon}</span>
            <span className="font-semibold text-forest text-sm text-center">{label}</span>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl text-forest">Tournaments</h2>
          <Link
            to="/admin/tournaments/new"
            className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full"
          >
            + New
          </Link>
        </div>

        {tournaments.length === 0 && (
          <p className="text-gray-500 text-sm">No tournaments yet.</p>
        )}

        {tournaments.map((t) => (
          <Link
            key={t.tournament_id}
            to={`/admin/tournaments/${t.tournament_id}`}
            className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="font-display font-bold text-forest">{t.name}</div>
            <div className="text-xs text-gray-400 capitalize">{t.status}</div>
          </Link>
        ))}
      </section>
    </div>
  )
}
