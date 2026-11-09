import { useState, useEffect, useCallback } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import {
  getQueuedScores,
  getNeedsReview,
  getFailedSync,
  dismissFailedSync,
  syncQueue,
} from '../utils/offlineQueue'

const SYNC_POLL_MS = 30000

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [reviewItems, setReviewItems] = useState([])
  const [failedItems, setFailedItems] = useState([])

  const refreshCounts = useCallback(() => {
    setPendingCount(getQueuedScores().length)
    setReviewItems(getNeedsReview())
    setFailedItems(getFailedSync())
  }, [])

  // Keep the banners in sync with whatever Scorecard (or another tab) does
  // to the queue.
  useEffect(() => {
    refreshCounts()
    window.addEventListener('mgm-offline-queue-changed', refreshCounts)
    window.addEventListener('storage', refreshCounts)
    return () => {
      window.removeEventListener('mgm-offline-queue-changed', refreshCounts)
      window.removeEventListener('storage', refreshCounts)
    }
  }, [refreshCounts])

  // Attempt a sync on load, whenever the device comes back online, whenever
  // the tab becomes visible again, and periodically while anything is
  // queued — not just when a player happens to have Scorecard open.
  useEffect(() => {
    function attemptSync() {
      syncQueue((path, body) => api.post(path, body, { suppressAuthRedirect: true })).then(refreshCounts)
    }
    attemptSync()
    function onVisible() {
      if (document.visibilityState === 'visible') attemptSync()
    }
    window.addEventListener('online', attemptSync)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => {
      if (getQueuedScores().length > 0) attemptSync()
    }, SYNC_POLL_MS)
    return () => {
      window.removeEventListener('online', attemptSync)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [refreshCounts])

  function handleLogout() {
    logout()
    navigate('/')
  }

  const reviewLink = reviewItems.length > 0
    ? `/scorecard/${reviewItems[0].registration_id}/${reviewItems[0].round_id}`
    : '/registrations'
  const failedReason = failedItems[0]?.reason || 'round locked'

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
                  <Link to="/about" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
                    About
                  </Link>
                  {user && (
                    <Link to="/registrations" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors border-t border-silver mt-1">
                      Registrations
                    </Link>
                  )}
                  {user && (
                    <Link to="/account" onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-forest font-semibold hover:bg-cream transition-colors">
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

      {/* Offline sync banners */}
      {pendingCount > 0 && (
        <div className="bg-yellow text-gray-900 text-xs font-semibold text-center py-1.5 px-4">
          {pendingCount} score{pendingCount !== 1 ? 's' : ''} waiting to sync — connect to the internet to submit
        </div>
      )}
      {reviewItems.length > 0 && (
        <Link
          to={reviewLink}
          className="block bg-[#CC0131] text-white text-xs font-semibold text-center py-1.5 px-4 hover:opacity-90 transition-opacity"
        >
          {reviewItems.length} score{reviewItems.length !== 1 ? 's' : ''} need your review →
        </Link>
      )}
      {failedItems.length > 0 && (
        <div className="bg-gray-200 text-gray-700 text-xs font-semibold text-center py-1.5 px-4 flex items-center justify-center gap-3">
          <span>
            {failedItems.length} score{failedItems.length !== 1 ? 's' : ''} couldn't be saved: {failedReason}
          </span>
          <button
            onClick={() => { dismissFailedSync(); refreshCounts() }}
            className="underline underline-offset-2 shrink-0"
          >
            Dismiss
          </button>
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
