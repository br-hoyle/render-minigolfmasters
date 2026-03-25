import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function ManageUsers() {
  useEffect(() => {
    document.title = 'Manage Users | Mini Golf Masters'
  }, [])

  const [users, setUsers] = useState([])
  const [invite, setInvite] = useState({ first_name: '', last_name: '', email: '', role: 'player' })
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  const [inviteError, setInviteError] = useState(null)

  useEffect(() => {
    api.get('/users/').then((us) => {
      setUsers(us)
      setLoading(false)
    })
  }, [])

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteSuccess(null)
    setInviteError(null)
    try {
      await api.post('/users/invite', invite)
      setInviteSuccess(`Invite sent to ${invite.email}`)
      setInvite({ first_name: '', last_name: '', email: '', role: 'player' })
      const us = await api.get('/users/')
      setUsers(us)
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">Manage Users</h1>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="space-y-4 bg-white rounded-xl p-4 shadow-sm">
        <h2 className="font-display font-bold text-lg text-forest">Invite User</h2>

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
          className="bg-forest text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-60"
        >
          {inviting ? 'Sending…' : 'Send Invite'}
        </button>
      </form>

      {/* User list */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-xl text-forest">Users ({users.length})</h2>
        {users.map((u) => (
          <div key={u.user_id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">
                {u.first_name} {u.last_name}
              </div>
              <div className="text-xs text-gray-400">{u.email}</div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-forest text-white' : 'bg-silver text-gray-600'}`}>
              {u.role}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
