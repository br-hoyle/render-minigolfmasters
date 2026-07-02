import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function Login() {
  useEffect(() => {
    document.title = 'Login | Mini Golf Masters'
  }, [])

  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [tab, setTab] = useState('login') // 'login' | 'register'

  // ── Login state ─────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState(null)
  const [forgotError, setForgotError] = useState(null)

  // ── Register state ───────────────────────────────────────────────────────────
  const [reg, setReg] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    password: '', confirm_password: '', notes: '',
    website: '', // honeypot — never shown to real users
  })
  const [invitedById, setInvitedById] = useState('')
  const [players, setPlayers] = useState([])
  const [regError, setRegError] = useState(null)
  const [regLoading, setRegLoading] = useState(false)
  const [regDone, setRegDone] = useState(false)

  useEffect(() => {
    api.get('/users/public')
      .then(data => {
        const sorted = [...data].sort((a, b) =>
          a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
        )
        setPlayers(sorted)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user])

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotError(null)
    setForgotMessage(null)
    setForgotLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail })
      setForgotMessage(res.detail || 'If that email is registered, a reset link has been sent.')
    } catch (err) {
      setForgotError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  function handleRegChange(e) {
    const { name, value } = e.target
    if (name === 'phone') {
      setReg((r) => ({ ...r, phone: formatPhone(value) }))
    } else {
      setReg((r) => ({ ...r, [name]: value }))
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setRegError(null)
    if (reg.password.length < 8) {
      setRegError('Password must be at least 8 characters')
      return
    }
    if (reg.password !== reg.confirm_password) {
      setRegError('Passwords do not match')
      return
    }
    setRegLoading(true)
    try {
      await api.post('/users/register', {
        first_name: reg.first_name,
        last_name: reg.last_name,
        email: reg.email,
        phone: reg.phone,
        password: reg.password,
        notes: reg.notes,
        website: reg.website,
        invited_by_id: invitedById || null,
      })
      setRegDone(true)
    } catch (err) {
      setRegError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className={`w-full space-y-4 transition-all ${tab === 'register' ? 'max-w-sm md:max-w-2xl' : 'max-w-sm'}`}>
        <div className="bg-white rounded-2xl border border-silver shadow-sm overflow-hidden">
          {/* Logo + heading */}
          <div className="text-center space-y-3 pt-8 px-8">
            <img
              src="/images/mgmt_logo_brandmark.png"
              alt="Mini Golf Masters"
              className="w-16 h-16 mx-auto object-contain"
            />
            <h1 className="font-display font-black text-2xl text-gray-900">Mini Golf Masters</h1>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-silver mt-6 px-8">
            <button
              onClick={() => setTab('login')}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'login'
                  ? 'border-forest text-forest'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab('register')}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'register'
                  ? 'border-forest text-forest'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="p-8">
            {/* ── SIGN IN ──────────────────────────────────────────────────── */}
            {tab === 'login' && (
              <div className="space-y-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                    />
                  </div>

                  {error && <p className="text-[#CC0131] text-sm font-medium">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60"
                  >
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>

                <div className="text-center">
                  <button
                    onClick={() => {
                      setShowForgot((v) => !v)
                      setForgotMessage(null)
                      setForgotError(null)
                      setForgotEmail('')
                    }}
                    className="text-sm text-gray-400 hover:text-forest underline underline-offset-2 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>
            )}

            {/* ── CREATE ACCOUNT ───────────────────────────────────────────── */}
            {tab === 'register' && (
              regDone ? (
                <div className="space-y-4 text-center py-4">
                  <div className="w-14 h-14 mx-auto bg-emerald/10 rounded-full flex items-center justify-center">
                    <svg className="w-7 h-7 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="font-display font-bold text-xl text-gray-900">Request submitted!</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Thanks for signing up. An admin will review your request and you'll receive an email
                    once your account has been approved.
                  </p>
                  <button
                    onClick={() => setTab('login')}
                    className="text-sm text-forest font-semibold underline underline-offset-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Row 1: Name */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">First Name</label>
                      <input
                        type="text"
                        name="first_name"
                        value={reg.first_name}
                        onChange={handleRegChange}
                        required
                        autoComplete="given-name"
                        className="w-full border border-silver rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">Last Name</label>
                      <input
                        type="text"
                        name="last_name"
                        value={reg.last_name}
                        onChange={handleRegChange}
                        required
                        autoComplete="family-name"
                        className="w-full border border-silver rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                  </div>

                  {/* Row 2: Email + Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={reg.email}
                        onChange={handleRegChange}
                        required
                        autoComplete="email"
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        value={reg.phone}
                        onChange={handleRegChange}
                        required
                        autoComplete="tel"
                        placeholder="(555) 555-5555"
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                  </div>

                  {/* Row 3: Password + Confirm */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">Password</label>
                      <input
                        type="password"
                        name="password"
                        value={reg.password}
                        onChange={handleRegChange}
                        required
                        autoComplete="new-password"
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        name="confirm_password"
                        value={reg.confirm_password}
                        onChange={handleRegChange}
                        required
                        autoComplete="new-password"
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                      />
                    </div>
                  </div>

                  {/* Row 4: Who invited you + Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">
                        Who invited you? <span className="text-[#CC0131]">*</span>
                      </label>
                      <select
                        value={invitedById}
                        onChange={(e) => setInvitedById(e.target.value)}
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest bg-white"
                      >
                        <option value="">Select a player…</option>
                        {players.map(p => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.first_name} {p.last_name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-gray-400">
                        We're a word-of-mouth community — let us know who brought you in!
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-800 mb-1">
                        Notes <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <textarea
                        name="notes"
                        value={reg.notes}
                        onChange={handleRegChange}
                        rows={3}
                        placeholder="How did you hear about us? Anything you'd like us to know?"
                        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest resize-none"
                      />
                    </div>
                  </div>

                  {/* Honeypot — visually hidden, real users never interact with it */}
                  <div className="absolute opacity-0 pointer-events-none h-0 overflow-hidden" aria-hidden="true">
                    <input
                      type="text"
                      name="website"
                      value={reg.website}
                      onChange={handleRegChange}
                      autoComplete="off"
                      tabIndex={-1}
                    />
                  </div>

                  {regError && <p className="text-[#CC0131] text-sm font-medium">{regError}</p>}

                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60"
                  >
                    {regLoading ? 'Submitting…' : 'Request Account'}
                  </button>

                  <p className="text-xs text-gray-400 text-center leading-relaxed">
                    Accounts are reviewed before activation. You'll receive an email once approved.
                  </p>
                </form>
              )
            )}
          </div>
        </div>

        {/* Forgot password panel */}
        {tab === 'login' && showForgot && (
          <div className="bg-white rounded-2xl border border-silver p-6 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-lg text-gray-900">Reset Password</h2>
            <p className="text-sm text-gray-500">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
              {forgotError && <p className="text-[#CC0131] text-sm">{forgotError}</p>}
              {forgotMessage && <p className="text-emerald text-sm font-semibold">{forgotMessage}</p>}
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60 text-sm"
              >
                {forgotLoading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
