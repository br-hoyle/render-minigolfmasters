import { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getQueuedScores } from '../utils/offlineQueue'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)

  useEffect(() => {
    function checkQueue() {
      setPendingSync(getQueuedScores().length > 0)
    }
    checkQueue()
    window.addEventListener('mgm-offline-queue-changed', checkQueue)
    return () => window.removeEventListener('mgm-offline-queue-changed', checkQueue)
  }, [])

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-forest text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link to="/">
          <img src="/images/mgmt_logo_primary_white.png" alt="Mini Golf Masters" className="h-10 object-contain" />
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <button
              onClick={handleLogout}
              className="border border-white text-white font-semibold text-sm px-4 py-1.5 rounded-full hover:bg-white hover:text-forest transition-colors"
            >
              Log Out
            </button>
          ) : (
            <Link
              to="/login"
              className="bg-yellow text-forest font-semibold text-sm px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Login
            </Link>
          )}

          {/* Hamburger with dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex flex-col gap-1 p-1"
              aria-label="Menu"
            >
              <span className="block w-5 h-0.5 bg-white"></span>
              <span className="block w-5 h-0.5 bg-white"></span>
              <span className="block w-5 h-0.5 bg-white"></span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 bg-white shadow-xl rounded-xl py-2 min-w-[180px] z-50">
                  <Link to="/" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Home
                  </Link>
                  <Link to="/tournaments" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Tournaments
                  </Link>
                  <Link to="/leaderboards" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Leaderboards
                  </Link>
                  <Link to="/courses" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Courses
                  </Link>
                  <Link to="/players" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Players
                  </Link>
                  <Link to="/contact" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    Contact Us
                  </Link>
                  {user && (
                    <Link to="/registrations" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors border-t border-silver mt-1">
                      Registrations
                    </Link>
                  )}
                  {user && (
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                      My Account
                    </Link>
                  )}
                  {user?.role === 'admin' && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                      Admin Portal
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Offline sync banner */}
      {pendingSync && (
        <div className="bg-yellow text-gray-900 text-xs font-semibold text-center py-1.5 px-4">
          Scores pending sync — connect to the internet to submit
        </div>
      )}

      {/* Page content */}
      <main className="bg-cream min-h-screen flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-forest py-8 px-4">
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/contact"
            className="bg-yellow text-forest font-semibold text-sm px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity"
          >
            Contact Us
          </Link>
          <img src="/images/mgmt_logo_brandmark.png" alt="Mini Golf Masters" className="h-16 object-contain mt-2" />
          <p className="font-bold text-white text-lg">Mini Golf Masters</p>
          <p className="italic text-xs text-white/70">putting responsibly since 2024</p>
        </div>
      </footer>
    </div>
  )
}
