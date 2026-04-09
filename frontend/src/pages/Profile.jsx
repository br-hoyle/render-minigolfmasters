import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Dialog from '../components/Dialog'
import LoadingOverlay from '../components/LoadingOverlay'
import { Spinner } from '../components/LoadingOverlay'

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z" />
    </svg>
  )
}

export default function Profile() {
  useEffect(() => {
    document.title = 'My Account | Mini Golf Masters'
  }, [])

  const { user: authUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [handicap, setHandicap] = useState(null)
  const [loading, setLoading] = useState(true)

  // Handicap request state
  const [pendingRequest, setPendingRequest] = useState(null)
  const [hcRequestOpen, setHcRequestOpen] = useState(false)
  const [hcForm, setHcForm] = useState({ requested_strokes: '', message: '' })
  const [hcSubmitting, setHcSubmitting] = useState(false)
  const [hcSuccess, setHcSuccess] = useState(false)
  const [hcError, setHcError] = useState(null)

  // Inline email edit
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailError, setEmailError] = useState(null)

  // Inline phone edit
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState(null)

  // Reset password dialog
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
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
      setEmailValue(me.email || '')
      setPhoneValue(me.phone || '')

      if (authUser) {
        const userHandicaps = handicaps.filter(
          (h) => h.user_id === me.user_id && h.active_to >= new Date().toISOString().split('T')[0]
        )
        userHandicaps.sort((a, b) => b.active_from.localeCompare(a.active_from))
        setHandicap(userHandicaps[0] || null)

        const pending = hcRequests.find((r) => r.status === 'pending')
        setPendingRequest(pending || null)
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

  async function handleSaveEmail() {
    setSavingEmail(true)
    setEmailError(null)
    try {
      const updated = await api.patch('/users/me', { email: emailValue })
      setProfile(updated)
      setEditingEmail(false)
    } catch (err) {
      setEmailError(err.message || 'Failed to save')
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleSavePhone() {
    setSavingPhone(true)
    setPhoneError(null)
    try {
      const updated = await api.patch('/users/me', { phone: phoneValue })
      setProfile(updated)
      setEditingPhone(false)
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
      setTimeout(() => {
        setPasswordSaved(false)
        setResetPasswordOpen(false)
      }, 1500)
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return <LoadingOverlay />
  }

  if (!profile) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
        ← Home
      </Link>
      <div>
        <h1 className="font-display font-black text-3xl text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your info and security.</p>
      </div>

      {/* Account Details Card */}
      <div className="bg-white rounded-xl border border-silver p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-gray-900">Account Details</h2>
          <button
            onClick={() => {
              setResetPasswordOpen(true)
              setPasswordError(null)
              setPasswordSaved(false)
            }}
            className="text-xs font-semibold text-forest border border-forest px-3 py-1.5 rounded-full hover:bg-forest hover:text-white transition-colors"
          >
            Reset Password
          </button>
        </div>

        {/* First Name */}
        <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <p className="text-xs font-semibold text-gray-500">First Name</p>
          <p className="text-sm font-bold text-gray-900">{profile.first_name}</p>
        </div>

        {/* Last Name */}
        <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <p className="text-xs font-semibold text-gray-500">Last Name</p>
          <p className="text-sm font-bold text-gray-900">{profile.last_name}</p>
        </div>

        {/* Email */}
        <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
          <p className="text-xs font-semibold text-gray-500 mt-1">Email</p>
          {editingEmail ? (
            <div className="space-y-1">
              <input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                autoFocus
                className="w-full border border-silver rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
              {emailError && <p className="text-[#CC0131] text-xs">{emailError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail || emailValue === profile.email}
                  className="text-xs font-semibold bg-forest text-white px-3 py-1 rounded-full disabled:opacity-60 hover:bg-emerald transition-colors flex items-center gap-1"
                >
                  {savingEmail ? <Spinner /> : null}
                  Save
                </button>
                <button
                  onClick={() => { setEditingEmail(false); setEmailValue(profile.email || ''); setEmailError(null) }}
                  className="text-xs font-semibold text-gray-500 px-3 py-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-700">{profile.email}</p>
              <button
                onClick={() => setEditingEmail(true)}
                className="text-gray-400 hover:text-forest transition-colors"
                aria-label="Edit email"
              >
                <PencilIcon />
              </button>
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
          <p className="text-xs font-semibold text-gray-500 mt-1">Phone</p>
          {editingPhone ? (
            <div className="space-y-1">
              <input
                type="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
                autoFocus
                placeholder="(555) 555-5555"
                className="w-full border border-silver rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
              {phoneError && <p className="text-[#CC0131] text-xs">{phoneError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSavePhone}
                  disabled={savingPhone}
                  className="text-xs font-semibold bg-forest text-white px-3 py-1 rounded-full disabled:opacity-60 hover:bg-emerald transition-colors flex items-center gap-1"
                >
                  {savingPhone ? <Spinner /> : null}
                  Save
                </button>
                <button
                  onClick={() => { setEditingPhone(false); setPhoneValue(profile.phone || ''); setPhoneError(null) }}
                  className="text-xs font-semibold text-gray-500 px-3 py-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-700">{profile.phone || <span className="text-gray-400 italic">Not set</span>}</p>
              <button
                onClick={() => setEditingPhone(true)}
                className="text-gray-400 hover:text-forest transition-colors"
                aria-label="Edit phone"
              >
                <PencilIcon />
              </button>
            </div>
          )}
        </div>

        {/* Role */}
        <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <p className="text-xs font-semibold text-gray-500">Role</p>
          <p className="text-sm capitalize text-gray-700">{profile.role}</p>
        </div>

        {/* Handicap */}
        <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <p className="text-xs font-semibold text-gray-500">Handicap</p>
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

      {/* View public profile link */}
      <p className="text-xs text-center text-gray-400">
        <Link to={`/players/${profile.user_id}`} className="text-forest hover:underline font-medium">
          View your public profile →
        </Link>
      </p>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetPasswordOpen}
        onClose={() => { setResetPasswordOpen(false); setPasswordError(null); setPasswordSaved(false) }}
        title="Reset Password"
      >
        {passwordSaved ? (
          <div className="text-center space-y-4">
            <p className="text-[#079E78] font-bold text-lg">Password updated!</p>
          </div>
        ) : (
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
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
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
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
                className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
            </div>
            {passwordError && <p className="text-[#CC0131] text-sm">{passwordError}</p>}
            <button
              type="submit"
              disabled={savingPassword}
              className="w-full bg-forest text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-emerald transition-colors flex items-center justify-center gap-2"
            >
              {savingPassword && <Spinner />}
              {savingPassword ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        )}
      </Dialog>

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
