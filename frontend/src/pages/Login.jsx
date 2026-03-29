import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'

export default function Login() {
  useEffect(() => {
    document.title = 'Login | Mini Golf Masters'
  }, [])

  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState(null)
  const [forgotError, setForgotError] = useState(null)

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user])

  async function handleSubmit(e) {
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

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        {/* Login card */}
        <div className="bg-white rounded-2xl border border-silver p-8 space-y-6 shadow-sm">
          {/* Logo + heading */}
          <div className="text-center space-y-3">
            <img
              src="/images/mgmt_logo_brandmark.png"
              alt="Mini Golf Masters"
              className="w-16 h-16 mx-auto object-contain"
            />
            <h1 className="font-display font-black text-2xl text-gray-900">Mini Golf Masters</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>

          <div className="space-y-2 text-center">
            <p className="text-sm text-gray-500">
              No account?{' '}
              <Link to="/contact" className="text-forest font-semibold underline underline-offset-2">
                Request an invite
              </Link>
            </p>
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

        {/* Forgot password panel */}
        {showForgot && (
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
