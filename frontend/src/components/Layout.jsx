import { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

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
                      Profile
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
          <p className="italic text-sm text-white/70">putting responsibly since 2024</p>
        </div>
      </footer>
    </div>
  )
}
