import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function TournamentRecap() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const [recap, setRecap] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    document.title = 'Recap | Mini Golf Masters'
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [t, r] = await Promise.all([
          api.get(`/tournaments/${tournamentId}`),
          api.get(`/tournaments/${tournamentId}/recap`),
        ])
        setTournament(t)
        setRecap(r)
        document.title = `${t.name} Recap | Mini Golf Masters`
      } catch (err) {
        setError(err.message || 'Failed to load recap')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId])

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!recap) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate(`/leaderboard/${tournamentId}`)}
        className="text-[#135D40] font-semibold text-sm hover:underline"
      >
        ← Leaderboard
      </button>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display font-black text-3xl text-gray-900">
          {tournament?.name}
        </h1>
        <p className="text-sm text-gray-500 font-semibold uppercase tracking-wide">Tournament Recap</p>
      </div>

      {/* Champion card */}
      {recap.champion && (
        <div className="bg-[#FBF50D] rounded-2xl p-6 text-center space-y-1">
          <p className="text-4xl">🏆</p>
          <p className="font-display font-black text-2xl text-gray-900">{recap.champion.name}</p>
          <p className="text-sm font-semibold text-gray-700">
            Champion · {recap.champion.net_score} net strokes
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {recap.tightest_finish_gap != null && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-gray-900">
              {recap.tightest_finish_gap === 0 ? 'Tie' : `+${recap.tightest_finish_gap}`}
            </p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Tightest Finish</p>
            <p className="text-xs text-gray-400">{recap.tightest_finish_gap === 0 ? 'Tied at the top' : `gap between 1st & 2nd`}</p>
          </div>
        )}

        {recap.hardest_hole && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-gray-900">
              Hole {recap.hardest_hole.hole_number}
            </p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Hardest Hole</p>
            <p className="text-xs text-gray-400">
              avg {recap.hardest_hole.avg_vs_par > 0 ? '+' : ''}{recap.hardest_hole.avg_vs_par?.toFixed(1)} vs par
            </p>
          </div>
        )}

        {recap.best_round && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4 col-span-2">
            <p className="text-xs text-gray-500 font-semibold mb-1">Best Single Round</p>
            <p className="font-display font-black text-xl text-gray-900">{recap.best_round.player_name}</p>
            <p className="text-sm text-gray-600 mt-0.5">
              {recap.best_round.strokes} strokes · {recap.best_round.round_label}
            </p>
          </div>
        )}
      </div>

      {/* Share */}
      <div className="flex gap-3">
        <button
          onClick={copyLink}
          className="flex-1 border border-[#E0E1E5] text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <Link
          to={`/leaderboard/${tournamentId}`}
          className="flex-1 bg-[#135D40] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#079E78] transition-colors text-center"
        >
          Full Leaderboard
        </Link>
      </div>
    </div>
  )
}
