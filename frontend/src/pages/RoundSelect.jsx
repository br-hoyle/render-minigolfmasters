import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function RoundSelect() {
  useEffect(() => {
    document.title = 'Select Round | Mini Golf Masters'
  }, [])

  const { registrationId } = useParams()
  const navigate = useNavigate()
  const [rounds, setRounds] = useState([])
  const [tournamentName, setTournamentName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const reg = await api.get(`/registrations/${registrationId}`)
        const [rs, tournament] = await Promise.all([
          api.get(`/rounds/?tournament_id=${reg.tournament_id}`),
          api.get(`/tournaments/${reg.tournament_id}`),
        ])
        setRounds(rs.sort((a, b) => a.round_number - b.round_number))
        setTournamentName(tournament.name)
      } catch (err) {
        setError(err.message || 'Failed to load rounds')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [registrationId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/tournaments')}
          className="text-forest font-semibold text-sm hover:underline"
        >
          ← Back
        </button>
        <div>
          <h1 className="font-display font-black text-2xl text-forest">Select Round</h1>
          {tournamentName && <p className="text-sm text-gray-500">{tournamentName}</p>}
        </div>
      </div>

      <div className="space-y-3">
        {rounds.length === 0 && (
          <p className="text-gray-500 text-sm">No rounds have been set up for this tournament yet.</p>
        )}
        {rounds.map((r) => (
          <Link
            key={r.round_id}
            to={`/scorecard/${registrationId}/${r.round_id}`}
            className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="font-display font-bold text-forest">{r.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">Round {r.round_number}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
