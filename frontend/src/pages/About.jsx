import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Banner from '../components/Banner'

export default function About() {
  useEffect(() => {
    document.title = 'About | Mini Golf Masters'
  }, [])

  return (
    <div className="bg-cream min-h-screen">
      <Banner />
      

      {/* Community */}
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">

      <Link to="/" className="text-forest font-semibold text-sm hover:underline block mb-6">
          ← Home
        </Link>
        <h2 className="font-display font-black text-3xl text-gray-900">About Us</h2>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            The Mini Golf Masters was born out of real necessity — the kind of necessity that only arises
            when you're standing in the rain at a waterlogged miniature golf course in Tennessee, squinting
            through beer goggles at a soaked scorecard, trying to figure out who's in first place, while
            simultaneously managing three groups of competitive adults and a busted pipe on hole four.
          </p>
          <p>
            This is not a Silicon Valley origin story. No one's getting rich. No one got a TechCrunch feature.
            What we got was a cleaner, faster, tamper-resistant way to run a tournament that genuinely
            matters — to the people who show up in costume every summer and practice their putts like it counts.
          </p>
          <p>
            That's what this community is built for. Not the country club crowd. Not the overly serious.
            The people who care just enough to do this the right way — real scoring, real standings, real
            accountability — while still having the time of their lives doing it. That's what makes MGMT
            the best amateur mini golf tournament community around: we take the competition seriously, so
            you don't have to take yourself seriously.
          </p>
          <p className="border-l-4 border-emerald pl-4 italic text-gray-600">
            If you're running a mini golf tournament in Tennessee — or heck, anywhere — and you want
            something better than a bar napkin scorecard and a parking lot argument, you're in
            the right place. And if you're just here to join a bunch of good-looking guys (self-
            reported, unverified, deeply optimistic) and hit the links, honestly? Also the right
            place.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-6">
          <Link
            to="/login"
            className="bg-forest text-white font-semibold px-8 py-3 rounded-full hover:bg-emerald transition-colors text-sm"
          >
            Create an Account
          </Link>
          <Link
            to="/contact"
            className="border border-forest text-forest font-semibold px-8 py-3 rounded-full hover:bg-forest hover:text-white transition-colors text-sm"
          >
            Contact Us
          </Link>
        </div>
      </div>

      {/* Founder — green panel */}
      <div className="bg-forest text-white px-4 py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="font-display font-black text-3xl">The Visionary</h2>
          <div className="flex flex-col sm:flex-row gap-8 items-start">
            <img
              src="/images/lansing_brown.jpeg"
              alt="Lansing Brown"
              className="w-40 h-40 rounded-2xl object-cover object-top shadow-md shrink-0 mx-auto sm:mx-0"
            />
            <div className="space-y-4 leading-relaxed">
              <p>
                Lansing Brown grew up in Branson, Missouri — a city locked in eternal combat with Myrtle Beach
                for the world's highest concentration of miniature golf courses. This is a real thing. Look it up.
              </p>
              <p>
                When he moved to Nashville, he discovered the city had exactly one miniature golf course. One.
                For a metropolis of over two million people. This was not acceptable.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Origin Story */}
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        <h2 className="font-display font-black text-3xl text-gray-900">Our Origin Story</h2>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            In June 2024, Lansing assembled 11 grown men in costume to compete across 54 holes of mini
            golf — for glory, for pride, and for the eternal shame of whoever finished last. He called it
            the <strong>Mini Golf Masters of Tennessee</strong>, or MGMT: a tradition not unlike no other
            thing that has ever come before or beyond in any way, shape, or form. (That's the official
            slogan. He wrote it himself.)
          </p>
          <p>
            Year one was thrilling. Year two was bigger, rainier, more dramatic, and — as it turned out —
            marred by an honest-to-goodness scoring scandal that Lansing uncovered two days later at his
            work desk, sweating through his forehead, smelling faintly of banana nut muffin.
          </p>
          <p>
            The problem with running an 18-hole, 12-player, 3-round tournament is that the scoring is
            hard. We first built a Google Sheet - which worked, but was laborious, ultimately tamperable 
            by anonymous users, and impossible to scale to become the largest Mini Golf Tournament the
            Volunteer State has ever seen. So, when we couldn't find a solution to manage it all - we built our own.
          </p>
          <p>
            <a
              href="https://blogaboutnothing.substack.com/p/the-18-hole-grassy-knoll-a-massive"
              target="_blank"
              rel="noopener noreferrer"
              className="text-forest font-semibold underline underline-offset-2 hover:text-emerald transition-colors"
            >
              Learn more about our origin story here →
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
