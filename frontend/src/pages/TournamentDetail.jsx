import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import LoadingOverlay from '../components/LoadingOverlay'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

function mapsUrl(address) {
  const encoded = encodeURIComponent(address)
  // Detect iOS/macOS with touch (iPad/iPhone)
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return isIOS
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`
}

const STATUS_PILL = {
  upcoming: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald/20 text-emerald',
  complete: 'bg-silver text-gray-500',
}

export default function TournamentDetail() {
  useEffect(() => {
    document.title = 'Tournament | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [tournament, setTournament] = useState(null)
  const [rounds, setRounds] = useState([])
  const [courses, setCourses] = useState({}) // course_id → course
  const [registrations, setRegistrations] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [t, rs, regs, publicUsers] = await Promise.all([
          api.get(`/tournaments/${tournamentId}`),
          api.get(`/rounds/?tournament_id=${tournamentId}`),
          api.get(`/registrations/?tournament_id=${tournamentId}`),
          api.get('/users/public'),
        ])
        setTournament(t)
        setRounds(rs.sort((a, b) => a.round_number - b.round_number))
        setRegistrations(regs)
        setUsers(publicUsers)
        document.title = `${t.name} | Mini Golf Masters`

        // Fetch unique courses for rounds
        const uniqueCourseIds = [...new Set(rs.map((r) => r.course_id).filter(Boolean))]
        const courseData = await Promise.all(uniqueCourseIds.map((id) => api.get(`/courses/${id}`)))
        const courseMap = Object.fromEntries(courseData.map((c) => [c.course_id, c]))
        setCourses(courseMap)
      } catch (err) {
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tournamentId])

  async function handleRegister() {
    setRegistering(true)
    setRegisterError(null)
    try {
      await api.post('/registrations/', { tournament_id: tournamentId })
      const regs = await api.get(`/registrations/?tournament_id=${tournamentId}`)
      setRegistrations(regs)
    } catch (err) {
      setRegisterError(err.message || 'Failed to register')
    } finally {
      setRegistering(false)
    }
  }

  if (loading) return <LoadingOverlay />
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>
  if (!tournament) return null

  const sortedRounds = [...rounds]
  const accepted = registrations.filter((r) => r.status === 'accepted')
  const waitlisted = registrations.filter((r) => r.status === 'waitlisted')
  const inReview = registrations.filter((r) => r.status === 'in_review')

  const myReg = user
    ? registrations.find(
        (r) => r.user_id === user.user_id && r.status !== 'rejected'
      )
    : null

  const canRegister =
    !!user &&
    !myReg &&
    (tournament.status === 'upcoming' || tournament.status === 'active')

  const canAddScores =
    !!myReg &&
    myReg.status === 'accepted' &&
    tournament.status === 'active'

  function playerName(userId) {
    const u = users.find((x) => x.user_id === userId)
    return u ? `${u.first_name} ${u.last_name}`.trim() : 'Unknown'
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/tournaments')}
        className="text-forest font-semibold text-sm hover:underline"
      >
        ← Tournaments
      </button>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display font-black text-3xl text-gray-900">{tournament.name}</h1>
          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold capitalize mt-1 ${STATUS_PILL[tournament.status] || 'bg-silver text-gray-500'}`}>
            {tournament.status}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {fmtDate(tournament.start_date)} – {fmtDate(tournament.end_date)}
          {tournament.entry_fee ? ` · $${Math.round(Number(tournament.entry_fee))} entry` : ''}
        </p>
        {tournament.max_players && (
          <p className="text-xs text-gray-400">{accepted.length} / {tournament.max_players} spots filled</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {(tournament.status === 'active' || tournament.status === 'complete') && (
          <Link
            to={`/leaderboard/${tournamentId}`}
            className="flex-1 bg-forest text-white font-semibold text-sm py-3 rounded-xl hover:bg-emerald transition-colors text-center"
          >
            View Leaderboard
          </Link>
        )}
        {tournament.status === 'complete' && (
          <Link
            to={`/tournaments/${tournamentId}/recap`}
            className="flex-1 border border-forest text-forest font-semibold text-sm py-3 rounded-xl hover:bg-forest hover:text-white transition-colors text-center"
          >
            View Recap
          </Link>
        )}
        {canAddScores && (
          <Link
            to={`/scorecard/${myReg.registration_id}`}
            className="flex-1 bg-emerald text-white font-semibold text-sm py-3 rounded-xl hover:bg-forest transition-colors text-center"
          >
            + Add Scores
          </Link>
        )}
      </div>

      {/* Register CTA */}
      {canRegister && (
        <div className="bg-white rounded-xl border border-silver p-4 space-y-2">
          <p className="font-bold text-gray-900 text-sm">Want to play?</p>
          {registerError && <p className="text-[#CC0131] text-xs">{registerError}</p>}
          <button
            onClick={handleRegister}
            disabled={registering}
            className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm hover:bg-emerald transition-colors disabled:opacity-60"
          >
            {registering ? 'Registering…' : 'Register for This Tournament'}
          </button>
        </div>
      )}

      {/* My registration status */}
      {myReg && (
        <div className="bg-emerald/10 rounded-xl border border-emerald/30 p-4">
          <p className="text-sm font-semibold text-emerald">
            You're registered ·{' '}
            <span className="capitalize">{myReg.status === 'in_review' ? 'Pending Review' : myReg.status}</span>
          </p>
        </div>
      )}

      {/* Public — prompt to log in to register */}
      {!user && (tournament.status === 'upcoming' || tournament.status === 'active') && (
        <div className="bg-white rounded-xl border border-silver p-4">
          <p className="text-sm text-gray-600">
            <Link to="/login" className="text-forest font-semibold hover:underline">Log in</Link>
            {' '}to register for this tournament.
          </p>
        </div>
      )}

      {/* Rounds & Courses */}
      {sortedRounds.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-bold text-xl text-gray-900">
            Rounds <span className="text-gray-400 text-base font-normal">({sortedRounds.length})</span>
          </h2>
          {sortedRounds.map((r) => {
            const course = courses[r.course_id]
            return (
              <div key={r.round_id} className="bg-white rounded-xl border border-silver p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900">
                    {r.label || `Round ${r.round_number}`}
                  </p>
                  <Link
                    to={`/leaderboard/${tournamentId}/round/${r.round_id}`}
                    className="text-xs text-forest font-semibold hover:underline"
                  >
                    Scores →
                  </Link>
                </div>
                {course && (
                  <p className="text-sm text-gray-700">{course.name}</p>
                )}
                {course?.address && (
                  <a
                    href={mapsUrl(course.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-forest font-semibold hover:underline"
                  >
                    📍 {course.address}
                  </a>
                )}
              </div>
            )
          })}
        </section>
      )}

      {/* Registrations */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-xl text-gray-900">Players</h2>
        <div className="flex gap-3 text-sm text-gray-600">
          <span><strong className="text-gray-900">{accepted.length}</strong> accepted</span>
          {waitlisted.length > 0 && <span><strong className="text-gray-900">{waitlisted.length}</strong> waitlisted</span>}
          {inReview.length > 0 && <span><strong className="text-gray-900">{inReview.length}</strong> pending</span>}
        </div>
        {accepted.length === 0 ? (
          <p className="text-sm text-gray-400">No confirmed players yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-silver divide-y divide-silver">
            {accepted.map((reg) => (
              <div key={reg.registration_id} className="px-4 py-2.5 text-sm text-gray-900 font-medium">
                {playerName(reg.user_id)}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
