export const FEAR_GREED_CACHE_KEY = 'fear-greed-cache-v1'
export const FEAR_GREED_CACHE_TTL_MS = 15 * 60 * 1000

function resolveStorage(storage) {
  return storage ?? globalThis.localStorage
}

export function readFearGreedCache({ storage, now = Date.now } = {}) {
  const cacheStorage = resolveStorage(storage)
  if (!cacheStorage) return null

  const rawValue = cacheStorage.getItem(FEAR_GREED_CACHE_KEY)
  if (!rawValue) return null

  try {
    const cached = JSON.parse(rawValue)
    if (!cached?.data || typeof cached.cachedAt !== 'number') {
      return null
    }
    if (now() - cached.cachedAt > FEAR_GREED_CACHE_TTL_MS) {
      return null
    }

    return {
      ...cached.data,
      fromCache: true,
      cacheUpdatedAt: new Date(cached.cachedAt).toISOString(),
    }
  } catch {
    cacheStorage.removeItem(FEAR_GREED_CACHE_KEY)
    return null
  }
}

export function writeFearGreedCache(data, { storage, now = Date.now } = {}) {
  const cacheStorage = resolveStorage(storage)
  if (!cacheStorage) return

  cacheStorage.setItem(
    FEAR_GREED_CACHE_KEY,
    JSON.stringify({
      cachedAt: now(),
      data,
    }),
  )
}
