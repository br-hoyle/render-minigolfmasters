import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'

const STATUSES = ['upcoming', 'active', 'complete']

export default function ManageTournament() {
  useEffect(() => {
    document.title = 'Manage Tournament | Mini Golf Masters'
  }, [])

  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const isNew = tournamentId === 'new'

  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', status: 'upcoming' })
  const [rounds, setRounds] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    async function load() {
      const [t, rs, regs] = await Promise.all([
        api.get(`/tournaments/${tournamentId}`),
        api.get(`/rounds/?tournament_id=${tournamentId}`),
        api.get(`/registrations/?tournament_id=${tournamentId}`),
      ])
      setForm({ name: t.name, start_date: t.start_date, end_date: t.end_date, status: t.status })
      setRounds(rs)
      setRegistrations(regs)
      setLoading(false)
    }
    load()
  }, [tournamentId, isNew])

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isNew) {
        const t = await api.post('/tournaments/', form)
        navigate(`/admin/tournaments/${t.tournament_id}`, { replace: true })
      } else {
        await api.patch(`/tournaments/${tournamentId}`, form)
      }
    } finally {
      setSaving(false)
    }
  }

  async function updateRegStatus(regId, status) {
    if (status === 'forfeit' && !confirm('Forfeit this registration?')) return
    await api.patch(`/registrations/${regId}`, { status })
    setRegistrations((rs) => rs.map((r) => (r.registration_id === regId ? { ...r, status } : r)))
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">
        {isNew ? 'New Tournament' : 'Manage Tournament'}
      </h1>

      {/* Tournament details form */}
      <form onSubmit={handleSave} className="space-y-4">
        {[
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'start_date', label: 'Start Date', type: 'date' },
          { name: 'end_date', label: 'End Date', type: 'date' },
        ].map(({ name, label, type }) => (
          <div key={name}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type}
              name={name}
              value={form[name]}
              onChange={handleChange}
              required
              className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>
        ))}

        {!isNew && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-forest text-white font-semibold py-3 rounded-lg hover:bg-emerald transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : isNew ? 'Create Tournament' : 'Save Changes'}
        </button>
      </form>

      {/* Registrations */}
      {!isNew && registrations.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-bold text-xl text-forest">Registrations</h2>
          {registrations.map((reg) => (
            <div key={reg.registration_id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{reg.user_id}</div>
                  <div className="text-xs text-gray-400 capitalize">{reg.status}</div>
                </div>
                <div className="flex gap-2">
                  {reg.status === 'in_review' && (
                    <>
                      <button
                        onClick={() => updateRegStatus(reg.registration_id, 'accepted')}
                        className="text-xs font-bold bg-[#079E78] text-white px-2 py-1 rounded-full"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => updateRegStatus(reg.registration_id, 'rejected')}
                        className="text-xs font-bold bg-[#CC0131] text-white px-2 py-1 rounded-full"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {reg.status === 'accepted' && (
                    <button
                      onClick={() => updateRegStatus(reg.registration_id, 'forfeit')}
                      className="text-xs font-bold bg-gray-300 text-gray-700 px-2 py-1 rounded-full"
                    >
                      Forfeit
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
