import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function vsParLabel(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

function vsParColor(n) {
  if (n == null) return 'text-gray-900'
  if (n < 0) return 'text-[#079E78]'
  if (n === 0) return 'text-gray-600'
  return 'text-[#CC0131]'
}

// ─── Large Donut Chart ────────────────────────────────────────────────────────
// Uses SVG <path> arc segments — precise boundaries, no strokeDashoffset gaps.

const D_CX = 50
const D_CY = 50
const D_R  = 36   // centre radius of the ring
const D_SW = 14   // ring thickness

const CATEGORIES = [
  { key: 'eagle_or_better', label: 'Eagles',        shortLabel: 'EAGLES',        color: '#079E78' },
  { key: 'birdie',          label: 'Birdies',        shortLabel: 'BIRDIES',       color: '#135D40' },
  { key: 'par',             label: 'Par',            shortLabel: 'PAR',           color: '#C4C6CC' },
  { key: 'bogey',           label: 'Bogey',          shortLabel: 'BOGEY',         color: '#4a4945' },
  { key: 'double_plus',     label: 'Double Bogeys+', shortLabel: 'DOUBLE BOGEYS+',color: '#000000' },
]

function polarXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function ringSegmentPath(cx, cy, r, sw, startDeg, endDeg) {
  const end = Math.min(endDeg, startDeg + 359.9999) // avoid SVG full-circle collapse
  const ro = r + sw / 2
  const ri = r - sw / 2
  const large = end - startDeg > 180 ? 1 : 0
  const s  = polarXY(cx, cy, ro, startDeg)
  const e  = polarXY(cx, cy, ro, end)
  const si = polarXY(cx, cy, ri, startDeg)
  const ei = polarXY(cx, cy, ri, end)
  return [
    `M ${s.x} ${s.y}`,
    `A ${ro} ${ro} 0 ${large} 1 ${e.x} ${e.y}`,
    `L ${ei.x} ${ei.y}`,
    `A ${ri} ${ri} 0 ${large} 0 ${si.x} ${si.y}`,
    'Z',
  ].join(' ')
}

function LargeDonut({ distribution }) {
  const total = distribution?.total || 0
  if (total === 0) return null

  let cumDeg = 0
  const segments = CATEGORIES
    .map((cat) => ({ ...cat, count: distribution[cat.key] || 0 }))
    .filter((cat) => cat.count > 0)
    .map((cat) => {
      const startDeg = cumDeg
      const endDeg   = cumDeg + (cat.count / total) * 360
      cumDeg = endDeg
      return { ...cat, startDeg, endDeg }
    })

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Donut */}
      <div className="relative" style={{ width: 250, height: 250 }}>
        <svg viewBox="0 0 100 100" width={250} height={250}>
          {/* Background ring */}
          <circle cx={D_CX} cy={D_CY} r={D_R} fill="none" stroke="#EDEDED" strokeWidth={D_SW} />
          {segments.map((seg, i) => (
            <path
              key={i}
              d={ringSegmentPath(D_CX, D_CY, D_R, D_SW, seg.startDeg, seg.endDeg)}
              fill={seg.color}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-black text-base text-gray-800">Overall</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {CATEGORIES.map((cat) => {
          const count = distribution[cat.key] || 0
          return (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-gray-600">
                {cat.label}{' '}
                <span className="font-semibold text-gray-800">({count})</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Category Bar Charts ──────────────────────────────────────────────────────

function CategoryBar({ cat, playerCount, playerTotal, fieldCount, fieldTotal }) {
  const playerPct = playerTotal > 0 ? Math.round((playerCount / playerTotal) * 100) : 0
  const fieldPct = fieldTotal > 0 ? Math.round((fieldCount / fieldTotal) * 100) : 0

  return (
  <div className="space-y-1">
    {/* Player bar */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black uppercase tracking-widest text-gray-500">{cat.shortLabel}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-gray-700">{playerPct}%</span>
          <span className="text-xs text-gray-400">vs. {fieldPct}% field</span>
        </div>
      </div>
      <div className="h-3.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${playerPct}%`, backgroundColor: cat.color }}
        />
      </div>
    </div>
    {/* Field bar */}
    <div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gray-300" style={{ width: `${fieldPct}%` }} />
      </div>
    </div>
  </div>
)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#E0E1E5] p-4 text-center">
      <p className={`text-2xl font-display font-black leading-none ${color || 'text-gray-900'}`}>
        {value ?? '—'}
      </p>
      <p className="text-xs font-semibold text-gray-500 mt-1.5">{label}</p>
    </div>
  )
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
    total_holes_played,
    best_finish,
    lowest_round_vs_par,
    highest_round_vs_par,
    avg_round_vs_par,
    rounds_under_par,
    hole_in_ones,
    scoring_distribution,
    field_scoring_distribution,
    championships = [],
    tournament_history = [],
  } = stats

  const hasScoring = (scoring_distribution?.total || 0) > 0

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

      {/* Back link */}
      <Link to="/players" className="text-forest font-semibold text-sm hover:underline block">
        ← Players
      </Link>

      {/* Name + champion badges */}
      <div className="space-y-3">
        <h1 className="font-display font-black text-4xl text-gray-900">
          {user.first_name} {user.last_name}
        </h1>
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

      {/* Stats grid — 3 columns, 3 rows matching mock */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tournaments" value={tournaments_entered} />
        <StatCard label="Rounds" value={rounds_played} />
        <StatCard label="Holes" value={total_holes_played ?? '—'} />

        <StatCard
          label="Round Avg"
          value={vsParLabel(avg_round_vs_par)}
          color={vsParColor(avg_round_vs_par)}
        />
        <StatCard
          label="Lowest Round"
          value={vsParLabel(lowest_round_vs_par)}
          color={vsParColor(lowest_round_vs_par)}
        />
        <StatCard
          label="Highest Round"
          value={vsParLabel(highest_round_vs_par)}
          color={vsParColor(highest_round_vs_par)}
        />

        <StatCard
          label="Holes in One"
          value={hole_in_ones}
        />
        <StatCard label="Rounds Under Par" value={rounds_under_par} />
        <StatCard
          label="Best Finish"
          value={best_finish != null ? `#${best_finish}` : '—'}
          color={best_finish === 1 ? 'text-[#135D40]' : 'text-gray-900'}
        />
      </div>

      <h2 className="font-display font-black text-xl text-gray-900">Statistics</h2>
      {/* Statistics card */}
      {hasScoring && (
        <div className="bg-white rounded-xl border border-[#E0E1E5] p-5 space-y-6">
          {/* Large donut */}
          <div className="flex justify-center">
            <LargeDonut distribution={scoring_distribution} />
          </div>

          {/* Divider */}
          <div className="border-t border-[#E0E1E5]" />

          {/* Per-category bar charts */}
          <div className="space-y-5">
            {CATEGORIES.map((cat) => (
              <CategoryBar
                key={cat.key}
                cat={cat}
                playerCount={scoring_distribution?.[cat.key] || 0}
                playerTotal={scoring_distribution?.total || 0}
                fieldCount={field_scoring_distribution?.[cat.key] || 0}
                fieldTotal={field_scoring_distribution?.total || 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tournament History */}
      {tournament_history.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-black text-xl text-gray-900">Tournament History</h2>
          <div className="rounded-xl border border-[#E0E1E5] overflow-hidden">
            <table className="text-sm w-full">
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
                  <tr
                    key={t.tournament_id}
                    className={`border-t border-[#E0E1E5] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/leaderboard/${t.tournament_id}`}
                        className="font-semibold text-gray-900 hover:text-forest hover:underline transition-colors"
                      >
                        {t.tournament_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500">{t.year}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${t.finish === 1 ? 'text-[#135D40]' : 'text-gray-700'}`}>
                        {t.finish === 1 ? '🥇' : t.finish === 2 ? '🥈' : t.finish === 3 ? '🥉' : `#${t.finish}`}
                      </span>
                      {t.total_players ? (
                        <span className="text-gray-400 font-normal ml-1">/ {t.total_players}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-gray-700">{t.net_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasScoring && tournament_history.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">No tournament history yet.</p>
      )}
    </div>
  )
}
