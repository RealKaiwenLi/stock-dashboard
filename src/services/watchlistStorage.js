export const WATCHLIST_STORAGE_KEY = 'stock-dashboard.watchlist.v1'

export function readWatchlist(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(WATCHLIST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeItems(parsed)
  } catch {
    return []
  }
}

export function writeWatchlist(items, storage = globalThis.localStorage) {
  const normalized = normalizeItems(items)
  try {
    storage?.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    return normalized
  }
  return normalized
}

export function addWatchlistItem(item, storage = globalThis.localStorage) {
  const current = readWatchlist(storage)
  const normalized = normalizeItem(item, current.length)
  if (!normalized) return current
  if (current.some((entry) => entry.symbol === normalized.symbol)) return current
  return writeWatchlist([...current, normalized], storage)
}

export function removeWatchlistItem(symbol, storage = globalThis.localStorage) {
  const target = String(symbol ?? '').toUpperCase()
  return writeWatchlist(
    readWatchlist(storage).filter((entry) => entry.symbol !== target),
    storage,
  )
}

function normalizeItems(items) {
  const seen = new Set()
  return items
    .map((item, index) => normalizeItem(item, index))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.symbol)) return false
      seen.add(item.symbol)
      return true
    })
}

function normalizeItem(item, index) {
  const symbol = String(item?.symbol ?? item?.ticker ?? '').trim().toUpperCase()
  if (!symbol) return null
  return {
    symbol,
    name: item.name ?? symbol,
    primaryExchange: item.primaryExchange ?? item.primary_exchange ?? '',
    type: item.type ?? '',
    addedAt: item.addedAt ?? new Date(0).toISOString(),
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
  }
}
