import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'

const ROLE_FILTER_OPTIONS = ['All', 'Player', 'Admin', 'Inactive']

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function fmtJoined(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}/${day}/${y}`
}

export default function ManageUsers() {
  useEffect(() => {
    document.title = 'Manage Users | Mini Golf Masters'
  }, [])

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [invite, setInvite] = useState({ first_name: '', last_name: '', email: '', phone: '', role: 'player' })
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  const [inviteError, setInviteError] = useState(null)
  const [updating, setUpdating] = useState(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')

  useEffect(() => {
    api.get('/users/').then((us) => {
      setUsers(us)
      setLoading(false)
    })
  }, [])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase()
      const matchesSearch = !search || name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
      const matchesRole =
        roleFilter === 'All' ||
        (roleFilter === 'Inactive' ? u.status === 'inactive' : u.role === roleFilter.toLowerCase() && u.status !== 'inactive')
      return matchesSearch && matchesRole
    })
  }, [users, search, roleFilter])

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteSuccess(null)
    setInviteError(null)
    try {
      const data = await api.post('/users/invite', invite)
      if (data.email_sent === false) {
        setInviteSuccess(`User created! Email delivery failed — share this link manually: ${data.invite_url}`)
      } else {
        setInviteSuccess(`Invite sent to ${invite.email} ✓`)
      }
      setInvite({ first_name: '', last_name: '', email: '', phone: '', role: 'player' })
      const us = await api.get('/users/')
      setUsers(us)
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(userId, newRole) {
    setUpdating(userId)
    try {
      const updated = await api.patch(`/users/${userId}`, { role: newRole })
      setUsers((us) => us.map((u) => (u.user_id === userId ? updated : u)))
    } finally {
      setUpdating(null)
    }
  }

  async function handleToggleStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive'
    const label = newStatus === 'inactive' ? 'Deactivate this user?' : 'Reactivate this user?'
    if (!confirm(label)) return
    setUpdating(userId)
    try {
      const updated = await api.patch(`/users/${userId}`, { status: newStatus })
      setUsers((us) => us.map((u) => (u.user_id === userId ? updated : u)))
    } finally {
      setUpdating(null)
    }
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setInviteSuccess(null)
    setInviteError(null)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link to="/admin" className="text-forest font-semibold text-sm hover:underline block">
        ← Portal
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-black text-4xl text-gray-900">Users</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="bg-forest text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-emerald transition-colors shrink-0"
        >
          + Invite User
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by Name or Email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
      />

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {ROLE_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setRoleFilter(opt)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
              roleFilter === opt
                ? 'bg-forest text-white'
                : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* User list */}
      <section className="space-y-3">
        {filteredUsers.length === 0 && (
          <p className="text-gray-500 text-sm">No users match your filters.</p>
        )}
        {filteredUsers.map((u) => {
          const isInactive = u.status === 'inactive'
          return (
            <div
              key={u.user_id}
              className={`bg-white rounded-xl border border-silver p-4 space-y-2 ${isInactive ? 'opacity-60' : ''}`}
            >
              {/* Row 1: name + role + deactivate */}
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-lg text-gray-900">
                  {u.first_name} {u.last_name}
                  {isInactive && (
                    <span className="ml-2 text-xs font-bold text-[#CC0131] bg-red-50 px-1.5 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={u.role}
                    disabled={updating === u.user_id || isInactive}
                    onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest disabled:opacity-60 disabled:cursor-not-allowed ${
                      u.role === 'admin' ? 'bg-forest text-white' : 'bg-silver text-gray-600'
                    }`}
                  >
                    <option value="player">player</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    onClick={() => handleToggleStatus(u.user_id, u.status)}
                    disabled={updating === u.user_id}
                    className={`text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-60 ${
                      isInactive
                        ? 'bg-emerald text-white hover:bg-forest'
                        : 'bg-[#CC0131] text-white hover:opacity-90'
                    }`}
                  >
                    {isInactive ? 'Reactivate' : 'Deactivate'}
                  </button>
                </div>
              </div>

              {/* Row 2: Joined date */}
              <p className="italic text-xs text-gray-400">
                Joined {fmtJoined(u.created_at)}
              </p>

              {/* Row 3: email | phone */}
              <p className="text-sm text-gray-600">
                {u.email}
                {u.phone && ` | ${u.phone}`}
              </p>
            </div>
          )
        })}
      </section>

      {/* Invite Dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} title="Invite User">
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'first_name', label: 'First Name' },
              { name: 'last_name', label: 'Last Name' },
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={invite[name]}
                  onChange={(e) => setInvite((i) => ({ ...i, [name]: e.target.value }))}
                  required
                  className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              required
              className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input
              type="tel"
              value={invite.phone}
              placeholder="(XXX) XXX-XXXX"
              onChange={(e) => setInvite((i) => ({ ...i, phone: formatPhone(e.target.value) }))}
              className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select
              value={invite.role}
              onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              className="w-full border border-silver rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {inviteSuccess && <p className="text-[#079E78] text-sm font-medium">{inviteSuccess}</p>}
          {inviteError && <p className="text-[#CC0131] text-sm font-medium">{inviteError}</p>}
          <button
            type="submit"
            disabled={inviting}
            className="w-full bg-forest text-white font-semibold py-3 rounded-lg disabled:opacity-60"
          >
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
      </Dialog>
    </div>
  )
}
