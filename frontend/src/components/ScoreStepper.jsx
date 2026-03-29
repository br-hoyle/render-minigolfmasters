/**
 * ScoreStepper — large tap-friendly +/- stepper for hole score entry.
 *
 * Props:
 *   value       {number}   current strokes
 *   onChange    {fn}       called with new value
 *   par         {number}   par for this hole (used for color coding)
 *   holeNumber  {number}   display label
 *   min         {number}   default 1
 *   max         {number}   default 20
 */
export default function ScoreStepper({ value, onChange, par, holeNumber, min = 1, max = 20 }) {
  const diff = value - par

  let scoreColor = 'text-gray-700'
  let scoreBg = 'bg-silver'
  if (diff < 0) {
    scoreColor = 'text-white'
    scoreBg = 'bg-[#079E78]'
  } else if (diff > 0) {
    scoreColor = 'text-white'
    scoreBg = 'bg-[#CC0131]'
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 bg-white rounded-xl shadow-sm">
      {/* Hole label */}
      <div className="w-16">
        <div className="text-xs text-gray-400 font-medium">HOLE</div>
        <div className="font-display font-bold text-2xl text-forest leading-none">{holeNumber}</div>
        <div className="text-xs text-gray-400">Par {par}</div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-14 h-14 rounded-full bg-forest text-white text-3xl font-bold flex items-center justify-center active:scale-95 disabled:opacity-30 transition-transform"
          aria-label="Decrease"
        >
          −
        </button>

        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-display font-bold ${scoreBg} ${scoreColor}`}
        >
          {value}
        </div>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-14 h-14 rounded-full bg-forest text-white text-3xl font-bold flex items-center justify-center active:scale-95 disabled:opacity-30 transition-transform"
          aria-label="Increase"
        >
          +
        </button>
      </div>

      {/* Relative to par */}
      <div className="w-12 text-right">
        <span className={`text-sm font-semibold ${diff < 0 ? 'text-[#079E78]' : diff > 0 ? 'text-[#CC0131]' : 'text-gray-400'}`}>
          {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
        </span>
      </div>
    </div>
  )
}
