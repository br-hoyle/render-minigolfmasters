import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Dialog from '../components/Dialog'

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function Profile() {
  useEffect(() => {
    document.title = 'Profile | Mini Golf Masters'
  }, [])

  const { user: authUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [handicap, setHandicap] = useState(null)
  const [championships, setChampionships] = useState([])
  const [loading, setLoading] = useState(true)

  // Handicap request state
  const [pendingRequest, setPendingRequest] = useState(null)
  const [hcRequestOpen, setHcRequestOpen] = useState(false)
  const [hcForm, setHcForm] = useState({ requested_strokes: '', message: '' })
  const [hcSubmitting, setHcSubmitting] = useState(false)
  const [hcSuccess, setHcSuccess] = useState(false)
  const [hcError, setHcError] = useState(null)

  // Phone form
  const [phone, setPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [phoneError, setPhoneError] = useState(null)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState(null)

  useEffect(() => {
    async function load() {
      const [me, handicaps, hcRequests] = await Promise.all([
        api.get('/users/me'),
        api.get('/handicaps/'),
        api.get('/handicap-requests/me').catch(() => []),
      ])
      setProfile(me)
      setPhone(me.phone || '')

      if (authUser) {
        const userHandicaps = handicaps.filter(
          (h) => h.user_id === me.user_id && h.active_to >= new Date().toISOString().split('T')[0]
        )
        userHandicaps.sort((a, b) => b.active_from.localeCompare(a.active_from))
        setHandicap(userHandicaps[0] || null)

        const pending = hcRequests.find((r) => r.status === 'pending')
        setPendingRequest(pending || null)

        // Fetch championships
        api.get(`/users/${me.user_id}/championships`).then(setChampionships).catch(() => {})
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleRequestHandicap(e) {
    e.preventDefault()
    setHcSubmitting(true)
    setHcError(null)
    try {
      const req = await api.post('/handicap-requests/', {
        requested_strokes: parseInt(hcForm.requested_strokes),
        message: hcForm.message,
      })
      setPendingRequest(req)
      setHcSuccess(true)
      setHcForm({ requested_strokes: '', message: '' })
      setTimeout(() => {
        setHcRequestOpen(false)
        setHcSuccess(false)
      }, 1500)
    } catch (err) {
      setHcError(err.message || 'Failed to submit request')
    } finally {
      setHcSubmitting(false)
    }
  }

  async function handleSavePhone(e) {
    e.preventDefault()
    setSavingPhone(true)
    setPhoneError(null)
    setPhoneSaved(false)
    try {
      const updated = await api.patch('/users/me', { phone })
      setProfile(updated)
      setPhoneSaved(true)
      setTimeout(() => setPhoneSaved(false), 3000)
    } catch (err) {
      setPhoneError(err.message || 'Failed to save')
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleSavePassword(e) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    setSavingPassword(true)
    try {
      await api.patch('/users/me', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSaved(false), 3000)
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading…</div>
  }

  if (!profile) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
        ← Home
      </Link>
      <div>
        <h1 className="font-display font-black text-3xl text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your account details.</p>
      </div>

      {/* Champion badges */}
      {championships.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Championships</p>
          <div className="flex flex-wrap gap-2">
            {championships.map((c) => (
              <span
                key={c.tournament_id}
                className="bg-[#FBF50D] text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full"
              >
                {c.tournament_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Account info card */}
      <div className="bg-white rounded-xl border border-silver p-5 space-y-4">
        <h2 className="font-display font-bold text-lg text-gray-900">Account Info</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">First Name</p>
            <p className="text-sm font-bold text-gray-900">{profile.first_name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Last Name</p>
            <p className="text-sm font-bold text-gray-900">{profile.last_name}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Email</p>
          <p className="text-sm text-gray-700">{profile.email}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Role</p>
          <p className="text-sm capitalize text-gray-700">{profile.role}</p>
        </div>

        {/* Handicap + Request Review */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Handicap</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              {handicap ? `${handicap.strokes} stroke${Number(handicap.strokes) !== 1 ? 's' : ''}` : 'None'}
            </p>
            {pendingRequest ? (
              <span className="text-xs text-yellow-600 font-semibold bg-yellow-50 px-2 py-0.5 rounded-full">
                Review pending
              </span>
            ) : (
              <button
                onClick={() => setHcRequestOpen(true)}
                className="text-xs font-bold text-forest hover:underline"
              >
                Request Review
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Phone edit card */}
      <form onSubmit={handleSavePhone} className="bg-white rounded-xl border border-silver p-5 space-y-4">
        <h2 className="font-display font-bold text-lg text-gray-900">Phone Number</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="(555) 555-5555"
            className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>
        {phoneError && <p className="text-[#CC0131] text-sm">{phoneError}</p>}
        {phoneSaved && <p className="text-emerald text-sm font-semibold">Phone saved!</p>}
        <button
          type="submit"
          disabled={savingPhone}
          className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60 text-sm"
        >
          {savingPhone ? 'Saving…' : 'Save Phone'}
        </button>
      </form>

      {/* Change password card */}
      <form onSubmit={handleSavePassword} className="bg-white rounded-xl border border-silver p-5 space-y-4">
        <h2 className="font-display font-bold text-lg text-gray-900">Change Password</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
          />
        </div>

        {passwordError && <p className="text-[#CC0131] text-sm">{passwordError}</p>}
        {passwordSaved && <p className="text-emerald text-sm font-semibold">Password updated!</p>}

        <button
          type="submit"
          disabled={savingPassword}
          className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60 text-sm"
        >
          {savingPassword ? 'Saving…' : 'Update Password'}
        </button>
      </form>

      {/* Handicap Request Dialog */}
      <Dialog
        open={hcRequestOpen}
        onClose={() => { setHcRequestOpen(false); setHcError(null); setHcSuccess(false) }}
        title="Request Handicap Review"
      >
        {hcSuccess ? (
          <div className="text-center space-y-4">
            <p className="text-[#079E78] font-bold text-lg">Request submitted!</p>
            <p className="text-sm text-gray-600">An admin will review your request.</p>
          </div>
        ) : (
          <form onSubmit={handleRequestHandicap} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Suggested Strokes</label>
              <input
                type="number"
                min="0"
                value={hcForm.requested_strokes}
                onChange={(e) => setHcForm((f) => ({ ...f, requested_strokes: e.target.value }))}
                required
                placeholder="e.g. 5"
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
              <textarea
                rows={3}
                value={hcForm.message}
                onChange={(e) => setHcForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Why are you requesting this handicap?"
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest resize-none"
              />
            </div>
            {hcError && <p className="text-[#CC0131] text-sm">{hcError}</p>}
            <button
              type="submit"
              disabled={hcSubmitting}
              className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-emerald transition-colors"
            >
              {hcSubmitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        )}
      </Dialog>
    </div>
  )
}
