/**
 * Offline score queue.
 *
 * Stores one entry per hole (keyed registration_id|round_id|hole_id), not
 * one entry per bulk submission — re-queuing a hole replaces its entry, so
 * the latest value a player entered always wins, and a live save success
 * for a hole removes any queued entry for it so a stale queued value can
 * never later overwrite a newer saved one (see removeQueuedScore, called
 * from Scorecard.jsx after every successful save).
 */

const QUEUE_KEY = 'mgm_offline_scores_v2'
const OLD_QUEUE_KEY = 'mgm_offline_scores' // pre-rework array-of-bulk-payloads format
const REVIEW_KEY = 'mgm_offline_scores_needs_review'
const FAILED_KEY = 'mgm_offline_scores_failed'

function keyFor(registrationId, roundId, holeId) {
  return `${registrationId}|${roundId}|${holeId}`
}

function notifyChanged() {
  window.dispatchEvent(new Event('mgm-offline-queue-changed'))
}

function readMap(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeMap(key, map) {
  localStorage.setItem(key, JSON.stringify(map))
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list))
}

/** Migrate the old array-of-{scores:[...]} payloads into the new per-hole map, once. */
function migrateOldFormatIfPresent() {
  let old
  try {
    old = JSON.parse(localStorage.getItem(OLD_QUEUE_KEY) || 'null')
  } catch {
    old = null
  }
  if (!Array.isArray(old) || old.length === 0) {
    if (old !== null) localStorage.removeItem(OLD_QUEUE_KEY)
    return
  }
  const map = readMap(QUEUE_KEY)
  for (const payload of old) {
    for (const item of payload?.scores || []) {
      if (!item?.registration_id || !item?.round_id || !item?.hole_id) continue
      map[keyFor(item.registration_id, item.round_id, item.hole_id)] = {
        registration_id: item.registration_id,
        round_id: item.round_id,
        hole_id: item.hole_id,
        strokes: item.strokes,
        expected_version: item.expected_version,
        queued_at: Date.now(),
      }
    }
  }
  writeMap(QUEUE_KEY, map)
  localStorage.removeItem(OLD_QUEUE_KEY)
}

function readQueueMap() {
  migrateOldFormatIfPresent()
  return readMap(QUEUE_KEY)
}

/** Queue a bulk-shaped payload ({ scores: [...] }) — kept as the external
 * shape so call sites don't change, but stored as one entry per hole. */
export function queueScores(payload) {
  const map = readQueueMap()
  for (const item of payload?.scores || []) {
    map[keyFor(item.registration_id, item.round_id, item.hole_id)] = {
      registration_id: item.registration_id,
      round_id: item.round_id,
      hole_id: item.hole_id,
      strokes: item.strokes,
      expected_version: item.expected_version,
      queued_at: Date.now(),
    }
  }
  writeMap(QUEUE_KEY, map)
  notifyChanged()
}

/** Remove one hole's queued entry — call after a live (non-queued) save of
 * that hole succeeds, so a stale queued value can't later overwrite it. */
export function removeQueuedScore(registrationId, roundId, holeId) {
  const map = readQueueMap()
  const key = keyFor(registrationId, roundId, holeId)
  if (!(key in map)) return
  delete map[key]
  writeMap(QUEUE_KEY, map)
  notifyChanged()
}

/** All queued score items, flattened. */
export function getQueuedScores() {
  return Object.values(readQueueMap())
}

export function clearQueuedScores() {
  localStorage.removeItem(QUEUE_KEY)
  notifyChanged()
}

/** Conflicts (409s) hit during a background sync — surfaced as a "needs
 * your review" banner; Scorecard re-opens the Keep mine / Use theirs
 * dialog for these on load. */
export function getNeedsReview() {
  return readList(REVIEW_KEY)
}

export function removeNeedsReview(registrationId, roundId, holeId) {
  const list = readList(REVIEW_KEY).filter(
    (r) => !(r.registration_id === registrationId && r.round_id === roundId && r.hole_id === holeId)
  )
  writeList(REVIEW_KEY, list)
  notifyChanged()
}

/** Items a background sync could not save at all (403/404/400) — surfaced
 * as a dismissible banner with the reason, never retried. */
export function getFailedSync() {
  return readList(FAILED_KEY)
}

export function dismissFailedSync() {
  localStorage.removeItem(FAILED_KEY)
  notifyChanged()
}

let inFlightSync = null

/**
 * Sync every queued hole, grouped per registration_id+round_id as one bulk
 * request each. Single-flight — a second caller while a sync is already
 * running gets the same in-flight promise instead of racing it.
 *
 * @param {(path: string, body: object) => Promise<any>} postFn
 * @returns {Promise<{synced: number, failed: number}>}
 */
export function syncQueue(postFn) {
  if (inFlightSync) return inFlightSync
  inFlightSync = doSync(postFn).finally(() => {
    inFlightSync = null
  })
  return inFlightSync
}

async function doSync(postFn) {
  const map = readQueueMap()
  const items = Object.values(map)
  if (items.length === 0) return { synced: 0, failed: 0 }

  const groups = new Map() // "registration_id|round_id" -> items[]
  for (const item of items) {
    const groupKey = `${item.registration_id}|${item.round_id}`
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(item)
  }

  let synced = 0
  let failed = 0
  const needsReview = readList(REVIEW_KEY)
  const failedList = readList(FAILED_KEY)

  for (const groupItems of groups.values()) {
    try {
      const res = await postFn('/scores/', {
        scores: groupItems.map((item) => ({
          registration_id: item.registration_id,
          round_id: item.round_id,
          hole_id: item.hole_id,
          strokes: item.strokes,
          expected_version: item.expected_version,
        })),
      })
      for (const item of groupItems) {
        removeQueuedScore(item.registration_id, item.round_id, item.hole_id)
        synced++
      }
      void res
    } catch (err) {
      const status = err?.status
      if (status === 409) {
        const detail = typeof err.detail === 'object' ? err.detail : {}
        const saved = detail.saved || []
        const conflicts = Array.isArray(detail.conflicts)
          ? detail.conflicts
          : (detail.current_version !== undefined ? [detail] : [])
        const savedHoleIds = new Set(saved.map((s) => s.hole_id))
        const conflictByHole = new Map(conflicts.map((c) => [c.hole_id, c]))
        for (const item of groupItems) {
          if (savedHoleIds.has(item.hole_id)) {
            removeQueuedScore(item.registration_id, item.round_id, item.hole_id)
            synced++
          } else if (conflictByHole.has(item.hole_id)) {
            const c = conflictByHole.get(item.hole_id)
            removeQueuedScore(item.registration_id, item.round_id, item.hole_id)
            needsReview.push({
              registration_id: item.registration_id,
              round_id: item.round_id,
              hole_id: item.hole_id,
              strokes: item.strokes,
              server_strokes: c.current_strokes,
              server_version: c.current_version,
              modified_by: c.modified_by,
            })
            failed++
          }
          // Neither saved nor conflicted (shouldn't normally happen): leave
          // it queued for the next sync attempt.
        }
      } else if (status === 403 || status === 404 || status === 400) {
        for (const item of groupItems) {
          removeQueuedScore(item.registration_id, item.round_id, item.hole_id)
          failedList.push({ ...item, reason: err.message || 'Could not be saved' })
        }
        failed += groupItems.length
      } else {
        // Network error, timeout, 401 (a relogin may fix it), or 5xx —
        // transient; leave queued for the next sync attempt.
        failed += groupItems.length
      }
    }
  }

  writeList(REVIEW_KEY, needsReview)
  writeList(FAILED_KEY, failedList)
  notifyChanged()

  return { synced, failed }
}
