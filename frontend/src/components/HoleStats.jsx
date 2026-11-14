import Dialog from './Dialog'

// Hole analytics for the scorecard: a one-line strip for the hole being
// played, and a dialog with every hole on the course. Data is one row per
// hole from GET /courses/{id}/analytics — all rounds ever played there.

function fmtAvg(v) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(2)
}

function fmtVsPar(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const fixed = n.toFixed(2)
  return n > 0 ? `+${fixed}` : fixed
}

function fmtPct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(Number(v) * 100)}%`
}

function vsParColor(v) {
  if (v === null || v === undefined) return 'text-gray-400'
  const n = Number(v)
  if (n < 0) return 'text-[#079E78]'
  if (n > 0) return 'text-[#CC0131]'
  return 'text-gray-600'
}

function Stat({ label, value }) {
  return (
    <div className="flex-1 min-w-0 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60 whitespace-nowrap">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums">{value}</p>
    </div>
  )
}

/** Compact stats for the current hole. Tapping it opens the full table. */
export function HoleStatStrip({ stat, holeCount, onOpen }) {
  const hasData = stat && stat.avg_score !== null && stat.avg_score !== undefined
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Show stats for all holes"
      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 flex items-center gap-2 text-left active:scale-[0.99] transition-transform"
    >
      {hasData ? (
        <>
          <Stat label="Avg" value={fmtAvg(stat.avg_score)} />
          <Stat label="vs Par" value={fmtVsPar(stat.vs_par)} />
          <Stat label="Aces" value={fmtPct(stat.ace_pct)} />
          <Stat label="Over" value={fmtPct(stat.bogey_plus_pct)} />
          <Stat
            label="Rank"
            value={stat.difficulty_rank ? `${stat.difficulty_rank}/${holeCount}` : '—'}
          />
        </>
      ) : (
        <p className="flex-1 text-xs text-white/70 text-center py-1.5">No stats for this hole yet</p>
      )}
      <span className="text-white/60 text-xs font-semibold shrink-0" aria-hidden="true">All ›</span>
    </button>
  )
}

/** Every hole on the course, with the current hole highlighted. */
export function HoleStatsDialog({ open, onClose, stats, currentHoleId, courseName }) {
  return (
    <Dialog open={open} onClose={onClose} title="Hole Stats">
      <p className="text-xs text-gray-500 -mt-2">
        {courseName ? `${courseName} · ` : ''}all rounds played here. Over = scored over par. Diff. 1 = hardest.
      </p>
      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-xl border border-silver">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-cream">
            <tr className="border-b border-silver text-gray-700">
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Hole</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Par</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Avg</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">vs Par</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Aces</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Over</th>
              <th className="px-1 py-2 text-center whitespace-nowrap font-bold">Diff.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-silver">
            {stats.map((h) => {
              const isCurrent = h.hole_id === currentHoleId
              return (
                <tr key={h.hole_id} className={isCurrent ? 'bg-yellow/30' : ''}>
                  <td className="px-1 py-2 text-center whitespace-nowrap font-display font-black text-sm text-gray-900">
                    {h.hole_number}
                  </td>
                  <td className="px-1 py-2 text-center whitespace-nowrap text-gray-800 tabular-nums">{h.par ?? '—'}</td>
                  <td className="px-1 py-2 text-center whitespace-nowrap text-gray-800 tabular-nums">{fmtAvg(h.avg_score)}</td>
                  <td className={`px-1 py-2 text-center whitespace-nowrap font-bold tabular-nums ${vsParColor(h.vs_par)}`}>
                    {fmtVsPar(h.vs_par)}
                  </td>
                  <td className="px-1 py-2 text-center whitespace-nowrap text-gray-800 tabular-nums">{fmtPct(h.ace_pct)}</td>
                  <td className="px-1 py-2 text-center whitespace-nowrap text-gray-800 tabular-nums">{fmtPct(h.bogey_plus_pct)}</td>
                  <td className="px-1 py-2 text-center whitespace-nowrap text-gray-800 tabular-nums">
                    {h.difficulty_rank ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  )
}
