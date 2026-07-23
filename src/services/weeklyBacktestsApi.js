export async function fetchWeeklyBacktests({ limit = 12, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`/api/weekly-backtests?limit=${limit}`)
  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload.message || 'Weekly backtests unavailable')
    error.code = payload.error
    throw error
  }
  return {
    items: payload.items ?? [],
    source: payload.source ?? 'notion',
    lastSyncedAt: payload.lastSyncedAt ?? null,
  }
}
