/**
 * ScoreGrid — compact grid score entry for all holes at once.
 * Used as an alternate mode in Scorecard.jsx.
 */

function parBadge(score, par) {
  if (typeof par !== 'number') return null
  const diff = score - par
  if (diff <= -2) return { label: 'Eagle', cls: 'bg-emerald text-white' }
  if (diff === -1) return { label: 'Birdie', cls: 'bg-emerald text-white' }
  if (diff === 0) return { label: 'Par', cls: 'bg-silver text-gray-700' }
  if (diff === 1) return { label: 'Bogey', cls: 'bg-[#CC0131] text-white' }
  if (diff === 2) return { label: 'Double', cls: 'bg-[#CC0131] text-white' }
  return { label: `+${diff}`, cls: 'bg-[#CC0131] text-white' }
}

export default function ScoreGrid({ holes, pars, scores, onScoreChange }) {
  const MIN_SCORE = 1
  const MAX_SCORE = 20

  return (
    <div className="space-y-2">
      {holes.map((hole) => {
        const hid = hole.hole_id
        const par = pars[hid] ?? null
        const score = scores[hid] ?? null
        const badge = score !== null ? parBadge(score, par) : null

        return (
          <div
            key={hid}
            className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            {/* Hole + Par */}
            <div className="w-16 shrink-0">
              <p className="text-white font-bold text-sm">Hole {hole.hole_number}</p>
              <p className="text-white/50 text-xs">Par {par ?? '—'}</p>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (score === null) onScoreChange(hid, par ?? MIN_SCORE)
                  else if (score > MIN_SCORE) onScoreChange(hid, score - 1)
                }}
                disabled={score !== null && score <= MIN_SCORE}
                className="h-10 w-10 rounded-lg bg-white/20 text-white text-xl font-black flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
                aria-label={`Decrease hole ${hole.hole_number}`}
              >
                −
              </button>
              <span className="text-white font-display font-black text-2xl w-8 text-center">
                {score ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (score === null) onScoreChange(hid, par ?? MIN_SCORE)
                  else if (score < MAX_SCORE) onScoreChange(hid, score + 1)
                }}
                disabled={score !== null && score >= MAX_SCORE}
                className="h-10 w-10 rounded-lg bg-white/20 text-white text-xl font-black flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
                aria-label={`Increase hole ${hole.hole_number}`}
              >
                +
              </button>
            </div>

            {/* Badge */}
            {badge && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
