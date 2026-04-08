import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'

function fmtVsPar(val, decimals = 2) {
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

function fmtNum(val, decimals = 2) {
  if (val === null || val === undefined) return 'N/A'
  return Number(val).toFixed(decimals)
}

function vsParColor(val) {
  if (val === null || val === undefined) return 'text-gray-400'
  const n = Number(val)
  if (n < 0) return 'text-emerald'
  if (n === 0) return 'text-gray-600'
  return 'text-[#CC0131]'
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-silver p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-display font-black text-gray-900 leading-tight">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function HoleRow({ hole, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const rowRef = useRef(null)

  useEffect(() => {
    if (defaultOpen && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [defaultOpen])

  const vsPar = hole.vs_par
  const colorClass = vsParColor(vsPar)

  return (
    <div ref={rowRef} className="border-b border-silver last:border-b-0">
      {/* Table-row style header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full grid grid-cols-[3rem_3rem_4rem_4.5rem_1fr] items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-display font-black text-base text-gray-900">#{hole.hole_number}</span>
        <span className="text-sm text-gray-500 text-center">{hole.par ?? '—'}</span>
        <span className="text-sm font-semibold text-gray-900 text-center">
          {hole.avg_score !== null ? fmtNum(hole.avg_score, 2) : '—'}
        </span>
        <span className={`text-sm font-bold text-center ${colorClass}`}>
          {hole.vs_par !== null ? fmtVsPar(hole.vs_par) : '—'}
        </span>
        <div className="flex items-center justify-end gap-3">
          {hole.difficulty_rank !== null && (
            <span className="text-xs text-gray-400">#{hole.difficulty_rank} hardest</span>
          )}
          <span className="text-gray-400 text-xs">{open ? '∧' : '∨'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="bg-gray-50 border-t border-silver px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Avg Score</span>
            <p className="font-bold text-gray-900 mt-0.5">{fmtNum(hole.avg_score, 2)}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Vs Par</span>
            <p className={`font-bold mt-0.5 ${colorClass}`}>{fmtVsPar(hole.vs_par)}</p>
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

const COMPARE_COLS = [
  { key: 'hole_number', label: 'Hole', fmt: (v) => `#${v}` },
  { key: 'par', label: 'Par', fmt: (v) => v ?? '—' },
  { key: 'avg_score', label: 'Avg', fmt: (v) => fmtNum(v, 2) },
  { key: 'vs_par', label: 'vs Par', fmt: (v, row) => v !== null ? fmtVsPar(v) : '—', color: true },
  { key: 'ace_pct', label: 'Ace %', fmt: fmtPct },
  { key: 'bogey_plus_pct', label: 'Bogey+%', fmt: fmtPct },
  { key: 'std_dev', label: 'Std Dev', fmt: (v) => fmtNum(v, 2) },
  { key: 'separation_score', label: 'Sep.', fmt: (v) => fmtNum(v, 2) },
  { key: 'difficulty_rank', label: 'Rank', fmt: (v) => v !== null ? `#${v}` : '—' },
]

function CompareTable({ holes }) {
  const [sortCol, setSortCol] = useState('hole_number')
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(key)
      setSortDir('asc')
    }
  }

  const sorted = [...holes].sort((a, b) => {
    const av = a[sortCol]
    const bv = b[sortCol]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-silver">
            {COMPARE_COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-forest select-none whitespace-nowrap"
              >
                {col.label}
                {sortCol === col.key && (
                  <span className="ml-1 text-forest">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-silver">
          {sorted.map((hole, i) => (
            <tr key={hole.hole_id} className={i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}>
              {COMPARE_COLS.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 text-center whitespace-nowrap ${
                    col.color ? vsParColor(hole[col.key]) + ' font-bold' : 'text-gray-900'
                  } ${col.key === 'hole_number' ? 'font-display font-black' : ''}`}
                >
                  {col.fmt(hole[col.key], hole)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [tab, setTab] = useState('by_hole')

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

  if (loading) return <LoadingOverlay />
  if (courseError) return <div className="p-8 text-center text-[#CC0131]">{courseError}</div>
  if (!course) return null

  const summary = analytics?.course_summary
  const holes = analytics?.holes || []
  const noData = summary && summary.sample_size === 0

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-forest font-semibold text-sm hover:underline">
        ← Courses
      </button>

      <div>
        <h1 className="font-display font-black text-3xl text-gray-900">{course.name}</h1>
        {course.address && <p className="text-sm text-gray-500 mt-1">{course.address}</p>}
        {course.description && (
          <p className="text-gray-700 text-sm leading-relaxed mt-3">{course.description}</p>
        )}
      </div>

      {analyticsLoading && <p className="text-gray-400 text-sm text-center">Loading analytics…</p>}
      {analyticsError && <p className="text-[#CC0131] text-sm">{analyticsError}</p>}

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
              <SummaryCard label="Ace Rate" value={fmtPct(summary.ace_rate)} />
              <SummaryCard
                label="Volatility"
                value={summary.volatility !== null ? `${fmtNum(summary.volatility, 1)} SD` : 'N/A'}
              />
              <SummaryCard label="Vs Par" value={fmtVsPar(summary.vs_par, 1)} />
              <SummaryCard label="Bogey Rate" value={fmtPct(summary.bogey_rate)} />
              <SummaryCard
                label="Sample Size"
                value={`${summary.sample_size} rounds`}
                sub={`${summary.total_hole_attempts.toLocaleString()} hole attempts`}
              />
            </div>
          </div>

          {/* Hole analytics — tabs */}
          {holes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold text-lg text-gray-900">Hole Analytics</h2>
                <div className="flex gap-1">
                  {['by_hole', 'compare'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        tab === t
                          ? 'bg-forest text-white'
                          : 'bg-white border border-silver text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t === 'by_hole' ? 'By Hole' : 'Compare'}
                    </button>
                  ))}
                </div>
              </div>

              {tab === 'by_hole' && (
                <div className="bg-white rounded-xl border border-silver overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[3rem_3rem_4rem_4.5rem_1fr] px-4 py-2 bg-gray-50 border-b border-silver">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hole</span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Par</span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Avg</span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">vs Par</span>
                    <span></span>
                  </div>
                  {holes.map((hole) => (
                    <HoleRow
                      key={hole.hole_id}
                      hole={hole}
                      defaultOpen={focusHole !== null && hole.hole_number === focusHole}
                    />
                  ))}
                </div>
              )}

              {tab === 'compare' && (
                <div className="bg-white rounded-xl border border-silver overflow-hidden">
                  <CompareTable holes={holes} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
