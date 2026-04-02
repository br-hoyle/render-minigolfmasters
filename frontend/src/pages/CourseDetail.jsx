import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

function fmtVsPar(val, decimals = 1) {
  if (val === null || val === undefined) return 'N/A'
  const n = Number(val)
  if (isNaN(n)) return 'N/A'
  const fixed = n.toFixed(decimals)
  return n > 0 ? `+${fixed}` : fixed
}

function fmtPct(val) {
  if (val === null || val === undefined) return 'N/A'
  return `${(Number(val) * 100).toFixed(1)}%`
}

function fmtNum(val, decimals = 1) {
  if (val === null || val === undefined) return 'N/A'
  return Number(val).toFixed(decimals)
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-[#E0E1E5] p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-display font-black text-gray-900 leading-tight">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function HoleAccordion({ hole, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const rowRef = useRef(null)

  useEffect(() => {
    if (defaultOpen && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [defaultOpen])

  const vsPar = hole.vs_par
  const vsParColor =
    vsPar === null ? 'text-gray-400'
    : vsPar < 0 ? 'text-[#079E78]'
    : vsPar === 0 ? 'text-gray-600'
    : 'text-[#CC0131]'

  const vsParLabel = vsPar !== null ? fmtVsPar(vsPar, 2) : null

  return (
    <div ref={rowRef} className="bg-white rounded-xl border border-[#E0E1E5] overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-display font-black text-xl text-gray-900 w-10">#{hole.hole_number}</span>
          <span className="text-sm text-gray-500">Par {hole.par ?? '—'}</span>
          {vsParLabel && (
            <span className={`text-sm font-bold ${vsParColor}`}>{vsParLabel} vs par</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hole.difficulty_rank !== null && (
            <span className="text-xs text-gray-400">#{hole.difficulty_rank} hardest</span>
          )}
          <span className="text-gray-400 text-sm">{open ? '∧' : '∨'}</span>
        </div>
      </button>

      {/* Expanded metrics */}
      {open && (
        <div className="border-t border-[#E0E1E5] px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Avg Score</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtNum(hole.avg_score, 2)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Vs Par</span>
            <p className={`font-bold mt-0.5 ${vsParColor}`}>{fmtVsPar(hole.vs_par, 2)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Ace %</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtPct(hole.ace_pct)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Bogey+ %</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtPct(hole.bogey_plus_pct)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Std Dev</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtNum(hole.std_dev, 2)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Separation</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtNum(hole.separation_score, 2)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CourseDetail() {
  const { courseId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const focusHole = searchParams.get('hole') ? Number(searchParams.get('hole')) : null

  const [course, setCourse] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [courseError, setCourseError] = useState(null)
  const [analyticsError, setAnalyticsError] = useState(null)

  useEffect(() => {
    api.get(`/courses/${courseId}`)
      .then((c) => {
        setCourse(c)
        document.title = `${c.name} | Mini Golf Masters`
      })
      .catch((err) => setCourseError(err.message))
      .finally(() => setLoading(false))
  }, [courseId])

  useEffect(() => {
    api.get(`/courses/${courseId}/analytics`)
      .then(setAnalytics)
      .catch((err) => setAnalyticsError(err.message))
      .finally(() => setAnalyticsLoading(false))
  }, [courseId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (courseError) return <div className="p-8 text-center text-[#CC0131]">{courseError}</div>
  if (!course) return null

  const summary = analytics?.course_summary
  const holes = analytics?.holes || []
  const noData = summary && summary.sample_size === 0

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="text-[#135D40] font-semibold text-sm hover:underline"
      >
        ← Back
      </button>

      {/* Header */}
      <div>
        <h1 className="font-display font-black text-3xl text-gray-900">{course.name}</h1>
        {course.address && <p className="text-sm text-gray-500 mt-1">{course.address}</p>}
        {course.description && (
          <p className="text-gray-700 text-sm leading-relaxed mt-3">{course.description}</p>
        )}
      </div>

      {/* Analytics */}
      {analyticsLoading && (
        <p className="text-gray-400 text-sm text-center">Loading analytics…</p>
      )}
      {analyticsError && (
        <p className="text-[#CC0131] text-sm">{analyticsError}</p>
      )}

      {analytics && noData && (
        <p className="text-gray-400 text-sm text-center py-6">
          No analytics available yet for this course.
        </p>
      )}

      {analytics && !noData && summary && (
        <>
          {/* Course summary cards */}
          <div>
            <h2 className="font-display font-bold text-lg text-gray-900 mb-3">Course Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SummaryCard
                label="Avg Score"
                value={fmtNum(summary.avg_score, 1)}
                sub={`Par ${summary.course_par}`}
              />
              <SummaryCard
                label="Vs Par"
                value={fmtVsPar(summary.vs_par, 1)}
              />
              <SummaryCard
                label="Adj. Difficulty"
                value={
                  summary.adjusted_difficulty !== null
                    ? fmtVsPar(summary.adjusted_difficulty, 1)
                    : 'Not enough data'
                }
                sub="vs player baseline"
              />
              <SummaryCard
                label="Ace Rate"
                value={fmtPct(summary.ace_rate)}
              />
              <SummaryCard
                label="Volatility"
                value={summary.volatility !== null ? `${fmtNum(summary.volatility, 1)} SD` : 'N/A'}
              />
              <SummaryCard
                label="Sample Size"
                value={`${summary.sample_size} rounds`}
                sub={`${summary.total_hole_attempts.toLocaleString()} hole attempts`}
              />
            </div>
          </div>

          {/* Hole accordion */}
          {holes.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display font-bold text-lg text-gray-900">Hole Analytics</h2>
                <span className="text-xs text-gray-400">Rank 1 = hardest</span>
              </div>
              <div className="space-y-2">
                {holes.map((hole) => (
                  <HoleAccordion
                    key={hole.hole_id}
                    hole={hole}
                    defaultOpen={focusHole !== null && hole.hole_number === focusHole}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
