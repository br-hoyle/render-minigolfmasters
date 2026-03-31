import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'

const ROLE_FILTER_OPTIONS = ['All', 'Player', 'Admin']
const STATUS_FILTER_OPTIONS = ['All', 'Invited', 'Active', 'Deactivated']

function userAccountStatus(u) {
  if (u.status === 'inactive') return 'deactivated'
  if (u.invite_pending) return 'invited'
  return 'active'
}

function StatusBadge({ status }) {
  const styles = {
    invited:     'bg-[#FBF50D] text-gray-800',
    active:      'bg-[#079E78]/15 text-[#079E78]',
    deactivated: 'bg-red-50 text-[#CC0131]',
  }
  const labels = { invited: 'Invited', active: 'Active', deactivated: 'Deactivated' }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

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
  const [statusFilter, setStatusFilter] = useState('All')
  const [resendingInvite, setResendingInvite] = useState(null) // user_id being resent

  // Handicap requests state
  const [handicapRequests, setHandicapRequests] = useState([])
  const [resolvingReq, setResolvingReq] = useState(null) // request_id being resolved

  useEffect(() => {
    Promise.all([
      api.get('/users/'),
      api.get('/handicap-requests/').catch(() => []),
    ]).then(([us, reqs]) => {
      setUsers(us)
      setHandicapRequests(reqs)
      setLoading(false)
    })
  }, [])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase()
      const matchesSearch = !search || name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
      const matchesRole = roleFilter === 'All' || u.role === roleFilter.toLowerCase()
      const acctStatus = userAccountStatus(u)
      const matchesStatus = statusFilter === 'All' || acctStatus === statusFilter.toLowerCase()
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, search, roleFilter, statusFilter])

  const pendingRequests = handicapRequests.filter((r) => r.status === 'pending')

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

  async function handleResendInvite(userId) {
    setResendingInvite(userId)
    try {
      const data = await api.post(`/users/${userId}/resend-invite`, {})
      if (data.email_sent === false) {
        alert(`Email delivery failed — share this link manually:\n${data.invite_url}`)
      } else {
        alert('Invite resent successfully.')
      }
    } catch (err) {
      alert(err.message || 'Failed to resend invite')
    } finally {
      setResendingInvite(null)
    }
  }

  async function resolveHandicapRequest(requestId, status) {
    setResolvingReq(requestId)
    try {
      const updated = await api.patch(`/handicap-requests/${requestId}`, { status })
      setHandicapRequests((reqs) =>
        reqs.map((r) => (r.request_id === requestId ? updated : r))
      )
    } catch (err) {
      alert(err.message || 'Failed to resolve request')
    } finally {
      setResolvingReq(null)
    }
  }

  function getUserName(userId) {
    const u = users.find((u) => u.user_id === userId)
    return u ? `${u.first_name} ${u.last_name}` : userId
  }

  function fmtSubmitted(isoStr) {
    if (!isoStr) return '—'
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide w-12">Role</span>
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide w-12">Status</span>
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
                statusFilter === opt
                  ? 'bg-forest text-white'
                  : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      <section className="space-y-3">
        {filteredUsers.length === 0 && (
          <p className="text-gray-500 text-sm">No users match your filters.</p>
        )}
        {filteredUsers.map((u) => {
          const isInactive = u.status === 'inactive'
          const acctStatus = userAccountStatus(u)
          return (
            <div
              key={u.user_id}
              className={`bg-white rounded-xl border border-silver p-4 space-y-2 ${isInactive ? 'opacity-60' : ''}`}
            >
              {/* Row 1: name + status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-lg text-gray-900">
                  {u.first_name} {u.last_name}
                </p>
                <StatusBadge status={acctStatus} />
              </div>

              {/* Row 2: role select + actions */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
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
                <div className="flex items-center gap-2 shrink-0">
                  {acctStatus === 'invited' && (
                    <button
                      onClick={() => handleResendInvite(u.user_id)}
                      disabled={resendingInvite === u.user_id}
                      className="text-xs font-semibold px-3 py-1 rounded-full border border-forest text-forest hover:bg-forest hover:text-white transition-colors disabled:opacity-60"
                    >
                      {resendingInvite === u.user_id ? 'Sending…' : 'Resend Invite'}
                    </button>
                  )}
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

              {/* Row 3: joined date */}
              <p className="italic text-xs text-gray-400">
                Invited {fmtJoined(u.created_at)}
              </p>

              {/* Row 4: email | phone */}
              <p className="text-sm text-gray-600">
                {u.email}
                {u.phone && ` | ${u.phone}`}
              </p>
            </div>
          )
        })}
      </section>

      {/* Handicap Requests section */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-gray-900">
          Handicap Requests
          {pendingRequests.length > 0 && (
            <span className="ml-2 text-sm font-semibold bg-[#FBF50D] text-gray-800 px-2 py-0.5 rounded-full">
              {pendingRequests.length} pending
            </span>
          )}
        </h2>

        {pendingRequests.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending handicap requests.</p>
        ) : (
          pendingRequests.map((req) => (
            <div key={req.request_id} className="bg-white rounded-xl border border-silver p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{getUserName(req.user_id)}</p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Requested: <strong>{req.requested_strokes} strokes</strong>
                  </p>
                  {req.message && (
                    <p className="text-sm text-gray-500 italic mt-1">"{req.message}"</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Submitted {fmtSubmitted(req.submitted_at)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => resolveHandicapRequest(req.request_id, 'approved')}
                    disabled={resolvingReq === req.request_id}
                    className="text-xs font-bold bg-forest text-white px-3 py-1.5 rounded-full hover:bg-emerald transition-colors disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => resolveHandicapRequest(req.request_id, 'rejected')}
                    disabled={resolvingReq === req.request_id}
                    className="text-xs font-bold border border-silver text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Show recently resolved ones (collapsed by default) */}
        {handicapRequests.filter((r) => r.status !== 'pending').length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
              View resolved requests ({handicapRequests.filter((r) => r.status !== 'pending').length})
            </summary>
            <div className="space-y-2 mt-2">
              {handicapRequests
                .filter((r) => r.status !== 'pending')
                .map((req) => (
                  <div key={req.request_id} className="bg-gray-50 rounded-xl border border-silver p-3 opacity-70">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-700">{getUserName(req.user_id)}</p>
                        <p className="text-xs text-gray-500">{req.requested_strokes} strokes</p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          req.status === 'approved'
                            ? 'bg-[#079E78]/20 text-[#079E78]'
                            : 'bg-red-100 text-[#CC0131]'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
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
