import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function AcceptInvite() {
  useEffect(() => {
    document.title = 'Create Account | Mini Golf Masters'
  }, [])

  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/accept-invite', { token, password })
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="max-w-sm mx-auto px-4 py-12 text-center text-[#CC0131] font-medium">
        Invalid invite link.
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12 space-y-6">
      <div className="text-center">
        <img src="/images/logo.png" alt="" className="w-16 h-16 mx-auto mb-3" />
        <h1 className="font-display font-black text-3xl text-forest">Create Account</h1>
        <p className="text-sm text-gray-500 mt-1">Set your password to activate your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>

        {error && <p className="text-[#CC0131] text-sm font-medium">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-forest text-white font-semibold py-3 rounded-lg hover:bg-emerald transition-colors disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
