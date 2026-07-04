export function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { from: formatDate(start), to: formatDate(end) }
}

export function getRollingMonthRange(date = new Date(), months = 12) {
  const start = new Date(date.getFullYear(), date.getMonth() - months + 1, 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { from: formatDate(start), to: formatDate(end) }
}

export function rangeIncludesMonth(range, monthDate) {
  if (!range?.from || !range?.to) return false
  const monthRange = getMonthRange(monthDate)
  return range.from <= monthRange.from && range.to >= monthRange.to
}

export function mergeDailyRecommendationData(current, incoming) {
  const itemMap = new Map((current?.items ?? []).map((item) => [item.date, item]))
  for (const item of incoming?.items ?? []) {
    itemMap.set(item.date, item)
  }
  return {
    items: [...itemMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    source: incoming?.source ?? current?.source ?? 'notion',
    lastSyncedAt: incoming?.lastSyncedAt ?? current?.lastSyncedAt ?? null,
    cacheTtlSeconds: incoming?.cacheTtlSeconds ?? current?.cacheTtlSeconds ?? null,
  }
}

export function buildCalendarDays(monthDate = new Date()) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const days = []
  for (let index = 0; index < start.getDay(); index += 1) {
    days.push({ key: `empty-start-${index}`, empty: true })
  }
  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day)
    days.push({ key: formatDate(date), date: formatDate(date), day })
  }
  return days
}

export async function fetchDailyRecommendations({ from, to, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetchImpl(`/api/daily-recommendations${suffix}`)
  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload.message || 'Daily recommendations unavailable')
    error.code = payload.error
    throw error
  }
  return {
    items: payload.items ?? [],
    source: payload.source ?? 'notion',
    lastSyncedAt: payload.lastSyncedAt ?? null,
    cacheTtlSeconds: payload.cacheTtlSeconds ?? null,
  }
}
