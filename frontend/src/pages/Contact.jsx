import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import Banner from '../components/Banner'

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function Contact() {
  useEffect(() => {
    document.title = 'Contact | Mini Golf Masters'
  }, [])

  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const initialSubject = params.get('subject') || ''

  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: initialSubject, message: '' })
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'phone') {
      setForm((f) => ({ ...f, phone: formatPhone(value) }))
    } else {
      setForm((f) => ({ ...f, [name]: value }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    setStatus('sending')
    try {
      await api.post('/contact', form)
      setStatus('sent')
      setForm({ name: '', email: '', phone: '', subject: '', message: '' })
    } catch (err) {
      setStatus('error')
      setErrorMsg(err?.message || 'Something went wrong. Please try again.')
    }
  }

  return (
    <div>
      <Banner />

      <div className="max-w-lg mx-auto px-6 py-10">
        <Link to="/" className="text-forest font-semibold text-sm hover:underline block mb-6">
          ← Home
        </Link>
        <h1 className="font-display font-bold text-3xl text-left text-gray-900">Contact Us</h1>
        <p className="text-sm text-gray-500 text-left mt-2 mb-8">
          We built this thing with love. Tell us what you think - unless it's a complaint about a score from 2024.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">Phone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
              placeholder="(555) 555-5555"
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">Subject</label>
            <input
              type="text"
              name="subject"
              value={form.subject}
              onChange={handleChange}
              required
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">Message</label>
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              required
              rows={6}
              className="w-full border border-silver rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest resize-none"
            />
          </div>

          {status === 'sent' && (
            <p className="text-[#079E78] font-medium text-sm">Message sent! We'll be in touch.</p>
          )}
          {status === 'error' && (
            <p className="text-[#CC0131] font-medium text-sm">
              {errorMsg || 'Something went wrong. Please try again.'}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-forest text-white font-semibold py-3 rounded-xl hover:bg-emerald transition-colors disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending…' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  )
}
