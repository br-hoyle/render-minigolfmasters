import React, { useEffect, useState, useRef } from 'react'
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

// Column definitions — order determines desktop column order
const COLS = [
  { key: 'hole_number',      label: 'Hole',    fmt: (v) => `#${v}`,            numeric: true  },
  { key: 'par',              label: 'Par',     fmt: (v) => v ?? '—',            numeric: true  },
  { key: 'avg_score',        label: 'Avg',     fmt: (v) => fmtNum(v, 2),        numeric: true  },
  { key: 'vs_par',           label: 'vs Par',  fmt: (v) => v !== null ? fmtVsPar(v) : '—', numeric: true, color: true },
  { key: 'separation_score', label: 'Sep.',    fmt: (v) => fmtNum(v, 2),        numeric: true  },
  { key: 'std_dev',          label: 'Std Dev', fmt: (v) => fmtNum(v, 2),        numeric: true  },
  { key: 'bogey_plus_pct',   label: 'Bogey+%', fmt: fmtPct,                    numeric: true  },
  { key: 'ace_pct',          label: 'Ace %',   fmt: fmtPct,                    numeric: true  },
  { key: 'difficulty_rank',  label: 'Rank',    fmt: (v) => v !== null ? `#${v}` : '—', numeric: true },
]

// Columns visible on mobile summary row (excluding chevron)
const MOBILE_COLS = ['hole_number', 'par', 'avg_score', 'vs_par', 'separation_score']

// Columns hidden on mobile (shown only in expanded detail)
const DESKTOP_ONLY_COLS = new Set(['std_dev', 'bogey_plus_pct', 'ace_pct', 'difficulty_rank'])

function SortIcon({ active, dir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>
  return <span className="ml-1 text-forest">{dir === 'asc' ? '↑' : '↓'}</span>
}

function HoleAnalyticsTable({ holes, focusHole }) {
  const [sortCol, setSortCol] = useState('hole_number')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedHole, setExpandedHole] = useState(focusHole)
  const focusRef = useRef(null)

  useEffect(() => {
    if (focusHole && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusHole])

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

  const mobileCols = COLS.filter((c) => MOBILE_COLS.includes(c.key))
  const detailCols = COLS.filter((c) => !MOBILE_COLS.includes(c.key) && c.key !== 'hole_number')

  return (
    <div className="overflow-x-auto rounded-xl border border-silver bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-cream border-b border-silver">
            {COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-3 py-2.5 text-center font-bold text-gray-700 whitespace-nowrap cursor-pointer hover:text-forest select-none transition-colors ${
                  DESKTOP_ONLY_COLS.has(col.key) ? 'hidden md:table-cell' : ''
                }`}
              >
                {col.label}
                <SortIcon active={sortCol === col.key} dir={sortDir} />
              </th>
            ))}
            {/* Mobile chevron header */}
            <th className="md:hidden px-3 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-silver">
          {sorted.map((hole) => {
            const isExpanded = expandedHole === hole.hole_number
            const isFocused = focusHole === hole.hole_number

            return (
              <React.Fragment key={hole.hole_id}>
                <tr
                  ref={isFocused ? focusRef : null}
                  className={`align-middle transition-colors hover:bg-cream/50 ${isFocused ? 'bg-yellow-50' : ''}`}
                >
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 text-center whitespace-nowrap ${
                        DESKTOP_ONLY_COLS.has(col.key) ? 'hidden md:table-cell' : ''
                      } ${col.color ? vsParColor(hole[col.key]) + ' font-bold' : 'text-gray-800'} ${
                        col.key === 'hole_number' ? 'font-display font-black text-sm' : ''
                      }`}
                    >
                      {col.fmt(hole[col.key], hole)}
                    </td>
                  ))}

                  {/* Mobile expand chevron */}
                  <td className="md:hidden px-3 py-2.5 text-right">
                    <button
                      onClick={() => setExpandedHole(isExpanded ? null : hole.hole_number)}
                      className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </td>
                </tr>

                {/* Mobile expanded detail */}
                {isExpanded && (
                  <tr className="md:hidden bg-cream/40">
                    <td colSpan={MOBILE_COLS.length + 1} className="px-4 py-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {detailCols.map((col) => (
                          <div key={col.key}>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">
                              {col.label}
                            </p>
                            <p className={`text-sm font-semibold ${col.color ? vsParColor(hole[col.key]) : 'text-gray-900'}`}>
                              {col.fmt(hole[col.key], hole)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
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

          {/* Hole analytics table */}
          {holes.length > 0 && (
            <div>
              <h2 className="font-display font-bold text-lg text-gray-900 mb-3">Hole Analytics</h2>
              <HoleAnalyticsTable holes={holes} focusHole={focusHole} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
