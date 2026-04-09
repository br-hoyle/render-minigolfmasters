import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }
const RANK_COLOR = {
  1: 'bg-[#FBF50D] text-gray-900',
  2: 'bg-gray-100 text-gray-800',
  3: 'bg-amber-100 text-amber-900',
}

function vsParLabel(n) {
  if (n == null) return null
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

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

  if (loading) return <LoadingOverlay />
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!recap) return null

  const { podium = [], tightest_finish_gap, last_place, best_round, hardest_hole,
          most_birdies, most_bogeys, hole_in_ones = []} = recap

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate(`/tournaments/${tournamentId}`)}
        className="text-[#135D40] font-semibold text-sm hover:underline"
      >
        ← Tournament Details
      </button>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display font-black text-3xl text-gray-900">
          {tournament?.name}
        </h1>
        <p className="text-sm text-gray-500 font-semibold uppercase tracking-wide">Tournament Recap</p>
      </div>

      {/* Podium: 1st, 2nd, 3rd */}
      {podium.length > 0 && (
        <div className="space-y-2">
          {podium.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-4 flex items-center gap-4 ${RANK_COLOR[p.rank] || 'bg-white border border-silver'}`}
            >
              <span className="text-3xl">{RANK_MEDAL[p.rank] || `#${p.rank}`}</span>
              <div className="flex-1">
                <p className="font-display font-black text-xl text-gray-900">{p.name}</p>
                <p className="text-xs font-semibold text-gray-600">
                  {p.rank === 1 ? 'Champion' : p.rank === 2 ? 'Runner-up' : '3rd Place'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-gray-900">{p.net_score}</p>
                <p className="text-xs text-gray-500">net</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        {tightest_finish_gap != null && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-gray-900">
              {tightest_finish_gap === 0 ? 'Tie' : `+${tightest_finish_gap}`}
            </p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Tightest Finish</p>
            <p className="text-xs text-gray-400">{tightest_finish_gap === 0 ? 'Tied at the top' : 'gap between 1st & 2nd'}</p>
          </div>
        )}

        {hardest_hole && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-[#CC0131]">
              Hole {hardest_hole.hole_number}
            </p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Hardest Hole</p>
            <p className="text-xs text-gray-400">
              avg {hardest_hole.avg_vs_par > 0 ? '+' : ''}{hardest_hole.avg_vs_par?.toFixed(1)} vs par
              {hardest_hole.round_label && ` · ${hardest_hole.round_label}`}
            </p>
          </div>
        )}

        {best_round && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4 col-span-2">
            <p className="text-xs text-gray-500 font-semibold mb-1">Best Single Round ⭐</p>
            <p className="font-display font-black text-xl text-gray-900">{best_round.player_name}</p>
            <p className="text-sm text-gray-600 mt-0.5">
              {best_round.strokes} strokes
              {best_round.vs_par != null && (
                <span className={`ml-1 font-bold ${best_round.vs_par < 0 ? 'text-[#079E78]' : best_round.vs_par > 0 ? 'text-[#CC0131]' : 'text-gray-600'}`}>
                  ({vsParLabel(best_round.vs_par)})
                </span>
              )}
              {' · '}{best_round.round_label}
            </p>
          </div>
        )}

        {most_birdies && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-[#079E78]">🐦 {most_birdies.count}</p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Most Birdies</p>
            <p className="text-xs text-gray-700 font-medium">{most_birdies.name}</p>
          </div>
        )}

        {most_bogeys && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4">
            <p className="text-2xl font-display font-black text-[#CC0131]">⛳ {most_bogeys.count}</p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Most Bogeys</p>
            <p className="text-xs text-gray-700 font-medium">{most_bogeys.name}</p>
          </div>
        )}

        {hole_in_ones.length > 0 && (() => {
          const byPlayer = hole_in_ones.reduce((acc, h) => {
            acc[h.player_name] = (acc[h.player_name] || 0) + 1
            return acc
          }, {})
          const sorted = Object.entries(byPlayer).sort((a, b) => b[1] - a[1])
          return (
            <div className="bg-[#079E78] rounded-xl p-4 col-span-2">
              <p className="text-xs text-white/80 font-semibold mb-2">🎯 Hole-in-One{hole_in_ones.length > 1 ? 's' : ''}!</p>
              <div className="space-y-1">
                {sorted.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{name}</span>
                    <span className="font-bold text-white text-sm">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {last_place && (
          <div className="bg-white rounded-xl border border-[#E0E1E5] p-4 col-span-2">
            <p className="text-xs text-gray-500 font-semibold mb-1">💩 The Caboose</p>
            <p className="font-display font-black text-xl text-gray-900">{last_place.name}</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {last_place.net_score} net · just happy they finished the tournament
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
