import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Home', icon: '⛳' },
  { to: '/tournaments', label: 'Tournaments', icon: '🏆' },
  { to: '/history', label: 'History', icon: '📋' },
  { to: '/contact', label: 'Contact', icon: '✉️' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Top bar */}
      <header className="bg-forest text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <NavLink to="/" className="font-display font-bold text-lg tracking-tight">
          Mini Golf Masters
        </NavLink>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              {user.role === 'admin' && (
                <NavLink to="/admin" className="text-yellow font-semibold">
                  Admin
                </NavLink>
              )}
              <button onClick={handleLogout} className="text-silver hover:text-white">
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="text-silver hover:text-white">
              Log in
            </NavLink>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      {/* Bottom tab nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-silver flex z-50">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium gap-0.5 transition-colors ${
                isActive ? 'text-forest' : 'text-gray-400'
              }`
            }
          >
            <span className="text-xl">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
