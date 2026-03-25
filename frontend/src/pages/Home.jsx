import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  useEffect(() => {
    document.title = 'Mini Golf Masters'
  }, [])

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-10">
      {/* Hero */}
      <section className="text-center space-y-4">
        <img src="/images/logo.png" alt="Mini Golf Masters" className="w-24 h-24 mx-auto" />
        <h1 className="font-display font-black text-4xl text-forest leading-tight">
          Mini Golf Masters
        </h1>
        <p className="text-gray-600 text-lg">
          An invite-only tournament for friends who take their mini golf very seriously.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            to="/tournaments"
            className="bg-forest text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-emerald transition-colors"
          >
            View Tournaments
          </Link>
          <Link
            to="/history"
            className="bg-silver text-gray-800 font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            View History
          </Link>
        </div>
      </section>

      {/* About */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-2xl text-forest">How It Works</h2>
        <ol className="space-y-2 text-gray-700">
          {[
            'Invitations go out to a select group of friends.',
            'Register for an upcoming tournament.',
            'Show up, play your round, enter scores hole by hole.',
            'Net scores (adjusted for handicap) determine the leaderboard.',
            'The best net score wins the green jacket — bragging rights included.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-display font-bold text-forest w-6 shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="bg-forest text-white rounded-2xl p-6 text-center space-y-3">
        <h2 className="font-display font-bold text-xl">Want to Join?</h2>
        <p className="text-sm text-green-100">
          Mini Golf Masters is invite-only. Reach out if you think you've got what it takes.
        </p>
        <Link
          to="/contact"
          className="inline-block bg-yellow text-forest font-bold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
        >
          Get In Touch
        </Link>
      </section>

      {/* Login CTA */}
      <section className="text-center">
        <Link to="/login" className="text-forest font-semibold underline underline-offset-2">
          Already have an account? Log in →
        </Link>
      </section>
    </div>
  )
}
