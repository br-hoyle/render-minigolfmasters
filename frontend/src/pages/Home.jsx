import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  useEffect(() => {
    document.title = 'Mini Golf Masters'
  }, [])

  return (
    <div>
      {/* Banner */}
      <div className="w-full h-44 overflow-hidden">
        <img
          src="/images/mgmt_banner.png"
          alt=""
          className="w-full h-full object-cover object-top"
        />
      </div>

      {/* Hero section */}
      <section className="bg-cream py-12 text-center px-6">
        <h1 className="font-display font-black text-3xl text-gray-900 leading-tight">
          The Tournament Experience Your Mini Golf League Deserves
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Live scores. Real handicaps. No paper scorecards. No excuses.
        </p>
        <Link
          to="/tournaments"
          className="inline-block bg-forest text-white font-semibold px-8 py-3 rounded-full mt-6 hover:bg-emerald transition-colors"
        >
          View Tournaments
        </Link>
      </section>

      {/* Quote section */}
      <section className="bg-white py-10 text-center px-8">
        <blockquote className="italic text-gray-600 text-sm">
          "A tradition not unlike no other thing that has ever come before or beyond in any way, shape or form - ever."
        </blockquote>
        <cite className="block text-sm text-gray-400 mt-2 not-italic">
          - Lansing Brown, Founder & Commissioner
        </cite>
      </section>

      {/* How it works section */}
      <section className="bg-cream py-12 px-6">
        <h2 className="font-display font-bold text-2xl text-center mb-8">
          Tee it Up in Three Steps
        </h2>
        <div className="space-y-8 max-w-lg mx-auto">
          <div className="flex items-start gap-6">
            <span className="font-display font-black text-6xl text-forest leading-none shrink-0 w-14 text-center">1</span>
            <div className="pt-2">
              <p className="font-bold text-lg text-gray-900">Get Invited</p>
              <p className="text-sm text-gray-500 mt-1">
                Mini Golf Masters is invite-only. Reach out through the contact form to request a spot.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-6">
            <span className="font-display font-black text-6xl text-forest leading-none shrink-0 w-14 text-center">2</span>
            <div className="pt-2">
              <p className="font-bold text-lg text-gray-900">Register for a Tournament</p>
              <p className="text-sm text-gray-500 mt-1">
                Browse upcoming tournaments, submit your registration, and wait for the nod from the admin.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-6">
            <span className="font-display font-black text-6xl text-forest leading-none shrink-0 w-14 text-center">3</span>
            <div className="pt-2">
              <p className="font-bold text-lg text-gray-900">Play. Score. Gloat.</p>
              <p className="text-sm text-gray-500 mt-1">
                Enter scores hole by hole on your phone. Net scores (handicap-adjusted) determine the leaderboard. The bragging rights are permanent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Public leaderboard CTA */}
      <section className="bg-white py-12 px-6 text-center">
        <h2 className="font-display font-bold text-2xl">The Receipts Are Public.</h2>
        <p className="text-sm text-gray-500 mt-3 mb-6">
          Anyone can see the leaderboard and score history. The good, the bad, the triple bogey on hole 7.
        </p>
        <Link
          to="/tournaments"
          className="inline-block bg-forest text-white font-semibold px-8 py-3 rounded-full hover:bg-emerald transition-colors"
        >
          View Leaderboards
        </Link>
      </section>
    </div>
  )
}
