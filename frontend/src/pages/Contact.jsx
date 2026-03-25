import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function Contact() {
  useEffect(() => {
    document.title = 'Contact | Mini Golf Masters'
  }, [])

  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent' | 'error'

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      await api.post('/contact', form)
      setStatus('sent')
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display font-black text-3xl text-forest">Contact</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'subject', label: 'Subject', type: 'text' },
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            name="message"
            value={form.message}
            onChange={handleChange}
            required
            rows={5}
            className="w-full border border-silver rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest resize-none"
          />
        </div>

        {status === 'sent' && (
          <p className="text-[#079E78] font-medium text-sm">Message sent! We'll be in touch.</p>
        )}
        {status === 'error' && (
          <p className="text-[#CC0131] font-medium text-sm">Something went wrong. Please try again.</p>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full bg-forest text-white font-semibold py-3 rounded-lg hover:bg-emerald transition-colors disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending…' : 'Send Message'}
        </button>
      </form>
    </div>
  )
}
