import { fetchFearGreedData } from './fearGreedApi'
import { readFearGreedCache, writeFearGreedCache } from './fearGreedCache'

export async function getFearGreedData({
  storage,
  now = Date.now,
  fetchFearGreedDataImpl = fetchFearGreedData,
} = {}) {
  const cached = readFearGreedCache({ storage, now })
  if (cached) {
    return cached
  }

  try {
    const data = await fetchFearGreedDataImpl()
    const freshData = { ...data, fromCache: false }
    writeFearGreedCache(data, { storage, now })
    return freshData
  } catch {
    return null
  }
}
