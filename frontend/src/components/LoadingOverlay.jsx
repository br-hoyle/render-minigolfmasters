/**
 * LoadingOverlay — animated loading indicator.
 * Use as a full-page overlay (fullScreen=true) or inline block.
 */
export default function LoadingOverlay({ message = 'Loading…', fullScreen = false }) {
  const inner = (
    <div className="flex flex-col items-center gap-3">
      {/* Spinning ring */}
      <svg
        className="animate-spin h-10 w-10 text-forest"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {message && <p className="text-sm font-medium text-gray-500">{message}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        {inner}
      </div>
    )
  }

  return <div className="flex items-center justify-center py-12">{inner}</div>
}

/**
 * Inline spinner — small animated icon for use inside buttons or cells.
 */
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
