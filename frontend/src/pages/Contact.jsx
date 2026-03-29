import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Banner from '../components/Banner'

export default function Contact() {
  useEffect(() => {
    document.title = 'Contact | Mini Golf Masters'
  }, [])

  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' })
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
      setForm({ name: '', email: '', phone: '', subject: '', message: '' })
    } catch {
      setStatus('error')
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
          We Built This Thing With Love. Tell Us What You Think — Unless it's a complaint About a Score From 2019.
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
            <label className="block text-sm font-bold text-gray-800 mb-1">
              Phone <span className="font-normal text-gray-400">[Optional]</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
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
            <p className="text-[#CC0131] font-medium text-sm">Something went wrong. Please try again.</p>
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
