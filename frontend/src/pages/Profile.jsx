import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

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
  const [loading, setLoading] = useState(true)

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
      const [me, handicaps] = await Promise.all([
        api.get('/users/me'),
        api.get('/handicaps/'),
      ])
      setProfile(me)
      setPhone(me.phone || '')

      if (authUser) {
        // Find the most recent active handicap for this user
        const userHandicaps = handicaps.filter(
          (h) => h.user_id === me.user_id && h.active_to >= new Date().toISOString().split('T')[0]
        )
        userHandicaps.sort((a, b) => b.active_from.localeCompare(a.active_from))
        setHandicap(userHandicaps[0] || null)
      }

      setLoading(false)
    }
    load()
  }, [])

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

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Handicap</p>
          <p className="text-sm text-gray-700">
            {handicap ? `${handicap.strokes} stroke${Number(handicap.strokes) !== 1 ? 's' : ''}` : 'None'}
          </p>
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
    </div>
  )
}
