const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return localStorage.getItem('token')
}

export function setToken(token) {
  localStorage.setItem('token', token)
}

export function clearToken() {
  localStorage.removeItem('token')
}

// A write (score submit, registration, etc.) gets a shorter timeout than a
// read — on bad signal, a stuck write should fail fast enough to fall back
// to the offline queue instead of leaving the player staring at a spinner.
const WRITE_TIMEOUT_MS = 15000
const READ_TIMEOUT_MS = 20000

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const isWrite = !!options.method && options.method.toUpperCase() !== 'GET'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), isWrite ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS)

  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal })
  } catch {
    // Network error, or the timeout above aborting the request — either
    // way this has no HTTP status, so callers already treat it the same
    // as "offline" (Render's free tier also spins down after inactivity).
    throw new Error("Looks like the server took a mulligan. Give it a few seconds and try again. ⛳")
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    const message = typeof error.detail === 'string' ? error.detail : 'Request failed'
    throw Object.assign(new Error(message), { status: res.status, detail: error.detail })
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
