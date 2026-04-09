import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import LoadingOverlay from '../components/LoadingOverlay'
import Banner from '../components/Banner'

const PAGE_SIZES = [10, 25, 50]

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
        active
          ? 'bg-forest text-white'
          : 'bg-white text-gray-600 border border-silver hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

export default function Players() {
  useEffect(() => {
    document.title = 'Players | Mini Golf Masters'
  }, [])

  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get('/users/public')
        // Sort alphabetically by last name, then first name
        data.sort((a, b) => {
          const lastCmp = (a.last_name || '').localeCompare(b.last_name || '')
          if (lastCmp !== 0) return lastCmp
          return (a.first_name || '').localeCompare(b.first_name || '')
        })
        setPlayers(data)
      } catch (err) {
        setError(err.message || 'Failed to load players')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalPages = Math.ceil(players.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, players.length)
  const visiblePlayers = players.slice(startIndex, endIndex)

  function handlePageSizeChange(size) {
    setPageSize(size)
    setCurrentPage(1)
  }

  if (loading) return <LoadingOverlay />
  if (error) return <div className="p-8 text-center text-[#CC0131]">{error}</div>

  return (
    <div>
      <Banner />
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Link to="/" className="text-forest font-semibold text-sm hover:underline block">
          ← Home
        </Link>

        <div>
          <h1 className="font-display font-black text-3xl text-gray-900">Players</h1>
          <p className="text-sm text-gray-500 mt-1">The Mini Golf Masters community.</p>
        </div>
        
        {/* Container */}
        <div className="flex items-center justify-between w-full flex-wrap gap-2">
          
          {/* Left: Per-page pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 mr-1">
              Per page:
            </span>
            {PAGE_SIZES.map((size) => (
              <FilterPill
                key={size}
                label={String(size)}
                active={pageSize === size}
                onClick={() => handlePageSizeChange(size)}
              />
            ))}
          </div>

          {/* Right: Showing text */}
          {players.length > 0 && (
            <p className="text-xs text-gray-400 text-right">
              Showing {startIndex + 1}–{endIndex} of {players.length} players
            </p>
          )}

        </div>

        {/* Player list */}
        <div className="divide-y divide-silver rounded-xl border border-silver overflow-hidden">
          {visiblePlayers.length === 0 ? (
            <p className="p-4 text-gray-400 text-sm text-center">No players found.</p>
          ) : (
            visiblePlayers.map((player) => (
              <Link
                key={player.user_id}
                to={`/players/${player.user_id}`}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors group"
              >
                <span className="text-sm font-semibold text-gray-900 group-hover:text-forest transition-colors">
                  {player.first_name} {player.last_name}
                </span>
                <span className="text-gray-300 group-hover:text-forest transition-colors text-sm">→</span>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="text-sm font-semibold text-forest disabled:text-gray-300 hover:underline disabled:no-underline"
            >
              ← Previous
            </button>
            <span className="text-xs text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="text-sm font-semibold text-forest disabled:text-gray-300 hover:underline disabled:no-underline"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
