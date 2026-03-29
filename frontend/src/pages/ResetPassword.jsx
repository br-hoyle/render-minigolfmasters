import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function ResetPassword() {
  useEffect(() => {
    document.title = 'Reset Password | Mini Golf Masters'
  }, [])

  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password-by-token', { token, new_password: newPassword })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err.message || 'Invalid or expired reset link. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-silver p-8 text-center space-y-4 shadow-sm">
          <p className="text-[#CC0131] font-semibold">Invalid reset link.</p>
          <Link to="/login" className="text-forest font-semibold underline underline-offset-2 text-sm">
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-silver p-8 space-y-6 shadow-sm">
        {/* Logo + heading */}
        <div className="text-center space-y-3">
          <img
            src="/images/mgmt_logo_brandmark.png"
            alt="Mini Golf Masters"
            className="w-16 h-16 mx-auto object-contain"
          />
          <h1 className="font-display font-black text-2xl text-gray-900">Set New Password</h1>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <p className="text-emerald font-semibold">Password updated! Redirecting to login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>

            {error && <p className="text-[#CC0131] text-sm font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60"
            >
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link to="/login" className="text-forest font-semibold underline underline-offset-2">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  )
}
