import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────

const DONUT_R = 38
const DONUT_CX = 50
const DONUT_CY = 50
const STROKE_WIDTH = 14
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R

function DonutSegments({ segments }) {
  // segments: [{ pct, color }]  where pct is 0..1
  let offset = 0
  // Start from the top (rotate -90deg on the group)
  return (
    <g transform={`rotate(-90 ${DONUT_CX} ${DONUT_CY})`}>
      {segments.map((seg, i) => {
        const dash = seg.pct * CIRCUMFERENCE
        const gap = CIRCUMFERENCE - dash
        const rotate = offset * 360
        offset += seg.pct
        return (
          <circle
            key={i}
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-(offset - seg.pct) * CIRCUMFERENCE}
            style={{ transform: `rotate(${rotate}deg)`, transformOrigin: `${DONUT_CX}px ${DONUT_CY}px` }}
          />
        )
      })}
    </g>
  )
}

function ScoringDonut({ distribution }) {
  const total = distribution?.total || 0
  if (total === 0) return <p className="text-gray-400 text-sm text-center py-8">No scored holes yet.</p>

  const { eagle_or_better, birdie, par, bogey, double_plus } = distribution
  const segments = [
    { label: 'Eagle+', count: eagle_or_better, color: '#079E78', pct: eagle_or_better / total },
    { label: 'Birdie', count: birdie, color: '#135D40', pct: birdie / total },
    { label: 'Par', count: par, color: '#E0E1E5', pct: par / total },
    { label: 'Bogey', count: bogey, color: '#F59E0B', pct: bogey / total },
    { label: 'Double+', count: double_plus, color: '#CC0131', pct: double_plus / total },
  ].filter((s) => s.count > 0)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Background track */}
          <circle
            cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
            fill="none" stroke="#F3F4EE" strokeWidth={STROKE_WIDTH}
          />
          <DonutSegments segments={segments} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-semibold text-gray-500">Scoring</span>
          <span className="text-xs font-bold text-gray-700">Mix</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs w-full max-w-[16rem]">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600 font-medium">{s.label}</span>
            <span className="text-gray-400 ml-auto">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VsFieldDonut({ playerAvg, fieldAvg }) {
  if (playerAvg == null || fieldAvg == null) return null

  // Visualize relative to ±5 scale; clamp to keep chart readable
  const MAX = 5
  const clamp = (v) => Math.max(-MAX, Math.min(MAX, v))
  const pClamped = clamp(playerAvg)
  const fClamped = clamp(fieldAvg)

  // Represent as fraction of MAX (always positive, color conveys good/bad)
  const pPct = Math.abs(pClamped) / (2 * MAX)
  const fPct = Math.abs(fClamped) / (2 * MAX)

  const playerColor = playerAvg < 0 ? '#079E78' : playerAvg === 0 ? '#E0E1E5' : '#CC0131'
  const fieldColor = '#E0E1E5'

  const segments = [
    { pct: pPct, color: playerColor },
    { pct: fPct, color: fieldColor },
    { pct: Math.max(0, 1 - pPct - fPct), color: '#F3F4EE' },
  ]

  function vsParLabel(n) {
    if (n === 0) return 'E'
    return n > 0 ? `+${n.toFixed(1)}` : `${n.toFixed(1)}`
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none" stroke="#F3F4EE" strokeWidth={STROKE_WIDTH} />
          <DonutSegments segments={segments} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-black ${playerAvg < 0 ? 'text-[#079E78]' : playerAvg > 0 ? 'text-[#CC0131]' : 'text-gray-600'}`}>
            {vsParLabel(playerAvg)}
          </span>
        </div>
      </div>
      <div className="text-center space-y-1">
        <div className="flex items-center gap-1.5 justify-center text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: playerColor }} />
          <span className="text-gray-600 font-medium">You: {vsParLabel(playerAvg)}</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center text-xs">
          <span className="w-2 h-2 rounded-full bg-[#E0E1E5]" />
          <span className="text-gray-500">Field: {vsParLabel(fieldAvg)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-silver p-4">
      <p className={`text-2xl font-display font-black ${color || 'text-gray-900'}`}>{value ?? '—'}</p>
      <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function vsParLabel(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

function finishLabel(finish, total) {
  if (finish == null) return '—'
  if (total) return `${finish} / ${total}`
  return `${finish}`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlayerStats() {
  const { userId } = useParams()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [u, s] = await Promise.all([
          api.get(`/users/public/${userId}`),
          api.get(`/users/${userId}/stats`),
        ])
        setUser(u)
        setStats(s)
        document.title = `${u.first_name} ${u.last_name} | Mini Golf Masters`
      } catch (err) {
        setError(err.message || 'Failed to load player stats')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  if (loading) return <LoadingOverlay />
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!user || !stats) return null

  const {
    tournaments_entered,
    rounds_played,
    best_finish,
    lowest_round_vs_par,
    highest_round_vs_par,
    rounds_under_par,
    scoring_avg_vs_par,
    current_handicap,
    first_tournament_date,
    last_tournament_date,
    hole_in_ones,
    scoring_distribution,
    field_avg_vs_par,
    championships = [],
    tournament_history = [],
  } = stats

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link to="/players" className="text-forest font-semibold text-sm hover:underline block">
        ← Players
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-display font-black text-3xl text-gray-900">
          {user.first_name} {user.last_name}
        </h1>

        {/* Champion badges */}
        {championships.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {championships.map((c) => (
              <span
                key={c.tournament_id}
                className="bg-[#FBF50D] text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full"
              >
                🏆 {c.tournament_name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Tournaments" value={tournaments_entered} />
        <StatCard label="Rounds Played" value={rounds_played} />
        <StatCard
          label="Best Finish"
          value={best_finish != null ? `#${best_finish}` : '—'}
          color={best_finish === 1 ? 'text-[#135D40]' : 'text-gray-900'}
        />
        <StatCard
          label="Handicap"
          value={current_handicap != null ? `${current_handicap}` : 'None'}
          sub={current_handicap != null ? `stroke${current_handicap !== 1 ? 's' : ''}` : undefined}
        />
        <StatCard
          label="Lowest Round"
          value={vsParLabel(lowest_round_vs_par)}
          color={lowest_round_vs_par != null && lowest_round_vs_par < 0 ? 'text-[#079E78]' : lowest_round_vs_par === 0 ? 'text-gray-600' : 'text-[#CC0131]'}
          sub="vs par"
        />
        <StatCard
          label="Highest Round"
          value={vsParLabel(highest_round_vs_par)}
          color={highest_round_vs_par != null && highest_round_vs_par < 0 ? 'text-[#079E78]' : highest_round_vs_par === 0 ? 'text-gray-600' : 'text-[#CC0131]'}
          sub="vs par"
        />
        <StatCard label="Rounds Under Par" value={rounds_under_par} />
        <StatCard
          label="Scoring Avg"
          value={scoring_avg_vs_par != null ? (scoring_avg_vs_par >= 0 ? `+${scoring_avg_vs_par}` : `${scoring_avg_vs_par}`) : '—'}
          sub="avg vs par / hole"
          color={scoring_avg_vs_par != null && scoring_avg_vs_par < 0 ? 'text-[#079E78]' : scoring_avg_vs_par === 0 ? 'text-gray-900' : 'text-[#CC0131]'}
        />
        {hole_in_ones > 0 && (
          <StatCard label="Hole-in-Ones 🎯" value={hole_in_ones} color="text-[#079E78]" />
        )}
        {first_tournament_date && (
          <StatCard
            label="First Season"
            value={first_tournament_date}
            sub={last_tournament_date && last_tournament_date !== first_tournament_date ? `Latest: ${last_tournament_date}` : undefined}
          />
        )}
      </div>

      {/* Charts row */}
      {(scoring_distribution?.total > 0 || field_avg_vs_par != null) && (
        <div className="bg-white rounded-xl border border-silver p-5">
          <h2 className="font-display font-bold text-lg text-gray-900 mb-4">Scoring Breakdown</h2>
          <div className={`flex gap-6 ${field_avg_vs_par != null ? 'items-start' : 'justify-center'}`}>
            {scoring_distribution?.total > 0 && (
              <div className="flex-1">
                <ScoringDonut distribution={scoring_distribution} />
              </div>
            )}
            {field_avg_vs_par != null && scoring_avg_vs_par != null && (
              <div className="flex flex-col items-center">
                <p className="text-xs font-semibold text-gray-500 mb-3 text-center">vs Field</p>
                <VsFieldDonut playerAvg={scoring_avg_vs_par} fieldAvg={field_avg_vs_par} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tournament history */}
      {tournament_history.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display font-bold text-lg text-gray-900">Tournament History</h2>
          <div className="overflow-x-auto rounded-xl border border-silver">
            <table className="text-sm w-full min-w-max">
              <thead>
                <tr className="bg-forest text-white">
                  <th className="text-left px-4 py-3 font-semibold">Tournament</th>
                  <th className="text-center px-3 py-3 font-semibold">Year</th>
                  <th className="text-center px-3 py-3 font-semibold">Finish</th>
                  <th className="text-center px-3 py-3 font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {tournament_history.map((t, i) => (
                  <tr key={t.tournament_id} className={`border-t border-silver ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{t.tournament_name}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{t.year}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${t.finish === 1 ? 'text-[#135D40]' : 'text-gray-700'}`}>
                        {t.finish === 1 ? '🥇' : t.finish === 2 ? '🥈' : t.finish === 3 ? '🥉' : `#${t.finish}`}
                        {t.total_players ? <span className="text-gray-400 font-normal text-xs ml-1">/ {t.total_players}</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-gray-700">{t.net_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tournament_history.length === 0 && scoring_distribution?.total === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">No tournament history yet.</p>
      )}
    </div>
  )
}
