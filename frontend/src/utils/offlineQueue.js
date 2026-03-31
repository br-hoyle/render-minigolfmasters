/**
 * Offline score queue utility.
 * Stores pending score submissions in localStorage when network is unavailable.
 * Scores are submitted as BulkSubmitScoresRequest payloads.
 */

const QUEUE_KEY = 'mgm_offline_scores'

/** Append a bulk scores payload to the queue. */
export function queueScores(payload) {
  const current = getQueuedScores()
  current.push(payload)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(current))
  window.dispatchEvent(new Event('mgm-offline-queue-changed'))
}

/** Return all queued payloads. */
export function getQueuedScores() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

/** Clear all queued scores. */
export function clearQueuedScores() {
  localStorage.removeItem(QUEUE_KEY)
  window.dispatchEvent(new Event('mgm-offline-queue-changed'))
}

/**
 * Attempt to sync all queued scores.
 * @param {Function} postFn - async function(path, body) for API calls
 * Returns { synced: number, failed: number }
 */
export async function syncQueue(postFn) {
  const queue = getQueuedScores()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  const remaining = []

  for (const payload of queue) {
    try {
      await postFn('/scores/', payload)
      synced++
    } catch {
      remaining.push(payload)
      failed++
    }
  }

  if (remaining.length === 0) {
    clearQueuedScores()
  } else {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
    window.dispatchEvent(new Event('mgm-offline-queue-changed'))
  }

  return { synced, failed }
}
