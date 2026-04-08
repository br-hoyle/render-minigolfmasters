import { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import Dialog from '../../components/Dialog'
import LoadingOverlay from '../../components/LoadingOverlay'

const ROLE_FILTER_OPTIONS = ['All', 'Player', 'Admin']
const STATUS_FILTER_OPTIONS = ['All', 'Invited', 'Active', 'Deactivated']

function userAccountStatus(u) {
  if (u.status === 'inactive') return 'deactivated'
  if (u.invite_pending) return 'invited'
  return 'active'
}

// ── Clickable inline dropdown badge ──────────────────────────────────────────
function InlineBadge({ label, className, options, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasOptions = options && options.length > 0 && !disabled

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => hasOptions && setOpen((o) => !o)}
        className={`text-xs font-bold px-2 py-0.5 rounded-full ${className} ${
          hasOptions ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {label}
        {hasOptions && <span className="ml-1 opacity-60">▾</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-silver shadow-lg z-20 py-1 min-w-max">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSelect(opt.value)
                setOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-cream font-medium text-gray-700"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, options, onSelect, disabled }) {
  const styles = {
    invited:     'bg-[#FBF50D] text-gray-800',
    active:      'bg-[#079E78]/15 text-[#079E78]',
    deactivated: 'bg-red-50 text-[#CC0131]',
  }
  const labels = { invited: 'Invited', active: 'Active', deactivated: 'Deactivated' }
  return (
    <InlineBadge
      label={labels[status]}
      className={styles[status]}
      options={options}
      onSelect={onSelect}
      disabled={disabled}
    />
  )
}

function RoleBadge({ role, options, onSelect, disabled }) {
  const className =
    role === 'admin' ? 'bg-forest text-white' : 'bg-silver text-gray-600'
  return (
    <InlineBadge
      label={role === 'admin' ? 'Admin' : 'Player'}
      className={className}
      options={options}
      onSelect={onSelect}
      disabled={disabled}
    />
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
  return `${m}/${day}/${d.getFullYear()}`
}

function fmtSubmitted(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Email inline edit on user card ───────────────────────────────────────────
function EmailInline({ userId, currentEmail, isInvitePending, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentEmail || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startEdit() {
    setValue(currentEmail || '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (!value || !value.includes('@')) { setError('Valid email required'); return }
    setSaving(true)
    try {
      await api.patch(`/users/${userId}`, { email: value })
      onSaved(userId, value)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Error saving email')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm text-gray-600">{currentEmail}</span>
        <button onClick={startEdit} className="text-xs text-forest hover:underline font-semibold">
          Edit
        </button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="border border-silver rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest"
      />
      {isInvitePending && (
        <span className="text-xs text-amber-600">New invite will be sent</span>
      )}
      {error && <span className="text-xs text-[#CC0131]">{error}</span>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs font-bold text-forest hover:underline disabled:opacity-60"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:underline">
        Cancel
      </button>
    </span>
  )
}

// ── Handicap inline edit on user card ────────────────────────────────────────
function HandicapInline({ userId, currentStrokes, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentStrokes != null ? String(currentStrokes) : '0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startEdit() {
    setValue(currentStrokes != null ? String(currentStrokes) : '0')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 0 || n > 30) { setError('0–30'); return }
    setSaving(true)
    try {
      await api.post('/handicaps/', { user_id: userId, strokes: n })
      onSaved(userId, n)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-xs text-gray-500">
          Handicap: {currentStrokes != null ? `+${currentStrokes}` : '0'}
        </span>
        <button
          onClick={startEdit}
          className="text-xs text-forest hover:underline font-semibold"
        >
          Edit
        </button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <input
        type="number"
        min={0}
        max={30}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="w-14 border border-silver rounded-lg px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-forest"
      />
      {error && <span className="text-xs text-[#CC0131]">{error}</span>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs font-bold text-forest hover:underline disabled:opacity-60"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:underline">
        Cancel
      </button>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ManageUsers() {
  useEffect(() => { document.title = 'Manage Users | Mini Golf Masters' }, [])

  const [searchParams] = useSearchParams()

  // Derive initial tab and status filter from URL params
  const initialTab = searchParams.get('tab') === 'handicap-requests' ? 'handicap-requests' : 'users'
  const statusParam = searchParams.get('status') || ''
  const initialStatus = STATUS_FILTER_OPTIONS.find(
    (o) => o.toLowerCase() === statusParam.toLowerCase()
  ) ?? 'All'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [users, setUsers] = useState([])
  const [handicaps, setHandicaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [invite, setInvite] = useState({ first_name: '', last_name: '', email: '', phone: '', role: 'player' })
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  const [inviteError, setInviteError] = useState(null)
  const [updating, setUpdating] = useState(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [resendingInvite, setResendingInvite] = useState(null)

  // Handicap requests
  const [handicapRequests, setHandicapRequests] = useState([])
  const [resolvingReq, setResolvingReq] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/users/'),
      api.get('/handicap-requests/').catch(() => []),
      api.get('/handicaps/').catch(() => []),
    ]).then(([us, reqs, hs]) => {
      setUsers(us)
      setHandicapRequests(reqs)
      setHandicaps(hs)
      setLoading(false)
    })
  }, [])

  // Current handicap per user (active_to = '9999-12-31')
  const handicapMap = useMemo(() => {
    const m = {}
    handicaps.forEach((h) => {
      if (h.active_to === '9999-12-31') m[h.user_id] = h.strokes
    })
    return m
  }, [handicaps])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase()
      const matchesSearch =
        !search || name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
      const matchesRole = roleFilter === 'All' || u.role === roleFilter.toLowerCase()
      const acctStatus = userAccountStatus(u)
      const matchesStatus = statusFilter === 'All' || acctStatus === statusFilter.toLowerCase()
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, search, roleFilter, statusFilter])

  const pendingRequests = handicapRequests.filter((r) => r.status === 'pending')

  // ── Handlers ───────────────────────────────────────────────────────────────
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

  async function handleStatusChange(userId, newStatus) {
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

  function handleEmailSaved(userId, newEmail) {
    setUsers((us) => us.map((u) => (u.user_id === userId ? { ...u, email: newEmail } : u)))
  }

  function handleHandicapSaved(userId, newStrokes) {
    setHandicaps((prev) => {
      const closed = prev.map((h) =>
        h.user_id === userId && h.active_to === '9999-12-31'
          ? { ...h, active_to: new Date().toISOString().split('T')[0] }
          : h
      )
      return [
        ...closed,
        {
          handicap_id: `local-${Date.now()}`,
          user_id: userId,
          strokes: newStrokes,
          active_from: new Date().toISOString().split('T')[0],
          active_to: '9999-12-31',
        },
      ]
    })
  }

  function getUserName(userId) {
    const u = users.find((u) => u.user_id === userId)
    return u ? `${u.first_name} ${u.last_name}` : userId
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setInviteSuccess(null)
    setInviteError(null)
  }

  if (loading) return <LoadingOverlay />

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
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

      {/* Tabs */}
      <div className="flex border-b border-silver">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-forest text-forest'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab('handicap-requests')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'handicap-requests'
              ? 'border-forest text-forest'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Handicap Requests
          {pendingRequests.length > 0 && (
            <span className="text-xs font-bold bg-[#FBF50D] text-gray-800 px-1.5 py-0.5 rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* ── USERS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
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

          {/* User cards */}
          {filteredUsers.length === 0 && (
            <p className="text-gray-500 text-sm">No users match your filters.</p>
          )}

          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const acctStatus = userAccountStatus(u)
              const isDisabled = updating === u.user_id

              // Status badge options based on current status
              const statusOptions =
                acctStatus === 'deactivated'
                  ? [{ value: 'active', label: 'Activate' }]
                  : [{ value: 'inactive', label: 'Deactivate' }]

              // Role badge options
              const roleOptions =
                u.role === 'admin'
                  ? [{ value: 'player', label: 'Change to Player' }]
                  : [{ value: 'admin', label: 'Change to Admin' }]

              return (
                <div
                  key={u.user_id}
                  className={`bg-white rounded-xl border border-silver p-4 space-y-2 ${
                    acctStatus === 'deactivated' ? 'opacity-60' : ''
                  }`}
                >
                  {/* Row 1: name + badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-bold text-lg text-gray-900">
                      {u.first_name} {u.last_name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge
                        status={acctStatus}
                        options={statusOptions}
                        onSelect={(val) => handleStatusChange(u.user_id, val)}
                        disabled={isDisabled}
                      />
                      <RoleBadge
                        role={u.role}
                        options={roleOptions}
                        onSelect={(val) => handleRoleChange(u.user_id, val)}
                        disabled={isDisabled || acctStatus === 'deactivated'}
                      />
                    </div>
                  </div>

                  {/* Row 2: joined date + resend invite */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="italic text-xs text-gray-400">
                      User Since: {fmtJoined(u.created_at)}
                    </p>
                    {acctStatus === 'invited' && (
                      <button
                        onClick={() => handleResendInvite(u.user_id)}
                        disabled={resendingInvite === u.user_id}
                        className="text-xs font-semibold px-3 py-1 rounded-full border border-forest text-forest hover:bg-forest hover:text-white transition-colors disabled:opacity-60"
                      >
                        {resendingInvite === u.user_id ? 'Sending…' : 'Resend Invite'}
                      </button>
                    )}
                  </div>

                  {/* Row 3: email (editable) | phone */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <EmailInline
                      userId={u.user_id}
                      currentEmail={u.email}
                      isInvitePending={u.invite_pending}
                      onSaved={handleEmailSaved}
                    />
                    {u.phone && <span className="text-sm text-gray-400">| {u.phone}</span>}
                  </div>

                  {/* Row 4: handicap */}
                  <HandicapInline
                    userId={u.user_id}
                    currentStrokes={handicapMap[u.user_id] ?? null}
                    onSaved={handleHandicapSaved}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── HANDICAP REQUESTS TAB ─────────────────────────────────────────── */}
      {activeTab === 'handicap-requests' && (
        <div className="space-y-3">
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
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted {fmtSubmitted(req.submitted_at)}
                    </p>
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

          {/* Resolved requests (collapsed) */}
          {handicapRequests.filter((r) => r.status !== 'pending').length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                View resolved requests ({handicapRequests.filter((r) => r.status !== 'pending').length})
              </summary>
              <div className="space-y-2 mt-2">
                {handicapRequests
                  .filter((r) => r.status !== 'pending')
                  .map((req) => (
                    <div
                      key={req.request_id}
                      className="bg-gray-50 rounded-xl border border-silver p-3 opacity-70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-700">
                            {getUserName(req.user_id)}
                          </p>
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
        </div>
      )}

      {/* ── INVITE DIALOG ─────────────────────────────────────────────────── */}
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
