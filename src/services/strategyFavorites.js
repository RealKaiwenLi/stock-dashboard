import { normalizeStrategyConfig } from './backtestStrategyConfig'

export const STRATEGY_FAVORITES_STORAGE_KEY = 'stock-dashboard.strategyFavorites.v1'
export const MAX_STRATEGY_FAVORITES = 30

export function readStrategyFavorites(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STRATEGY_FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeFavorites(parsed)
  } catch {
    return []
  }
}

export function writeStrategyFavorites(favorites, storage = globalThis.localStorage) {
  const normalized = normalizeFavorites(favorites).slice(0, MAX_STRATEGY_FAVORITES)
  try {
    storage?.setItem(STRATEGY_FAVORITES_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    return normalized
  }
  return normalized
}

export function saveStrategyFavorite(strategy, storage = globalThis.localStorage) {
  const template = normalizeStrategyTemplate(strategy)
  if (!template) return readStrategyFavorites(storage)

  const current = readStrategyFavorites(storage)
  const fingerprint = createStrategyFingerprint(template)
  const existingIndex = current.findIndex((favorite) => favorite.fingerprint === fingerprint)
  const savedAt = new Date().toISOString()

  if (existingIndex >= 0) {
    const next = current.map((favorite, index) => (
      index === existingIndex ? { ...favorite, name: template.name, strategy: template, savedAt } : favorite
    ))
    return writeStrategyFavorites(next, storage)
  }

  return writeStrategyFavorites([
    {
      id: `favorite-${Date.now()}`,
      name: template.name,
      strategy: template,
      fingerprint,
      savedAt,
    },
    ...current,
  ], storage)
}

export function removeStrategyFavorite(id, storage = globalThis.localStorage) {
  return writeStrategyFavorites(
    readStrategyFavorites(storage).filter((favorite) => favorite.id !== id),
    storage,
  )
}

export function createStrategyFingerprint(strategy) {
  return JSON.stringify(normalizeStrategyTemplate(strategy))
}

function normalizeFavorites(favorites) {
  const seen = new Set()
  return favorites
    .map(normalizeFavorite)
    .filter(Boolean)
    .filter((favorite) => {
      if (seen.has(favorite.fingerprint)) return false
      seen.add(favorite.fingerprint)
      return true
    })
}

function normalizeFavorite(favorite) {
  const strategy = normalizeStrategyTemplate(favorite?.strategy)
  if (!strategy) return null
  return {
    version: 2,
    id: String(favorite.id || `favorite-${favorite.fingerprint || Date.now()}`),
    name: String(favorite.name || strategy.name),
    strategy,
    fingerprint: favorite.fingerprint || createStrategyFingerprint(strategy),
    savedAt: favorite.savedAt || new Date(0).toISOString(),
  }
}

function normalizeStrategyTemplate(strategy) {
  if (!strategy) return null
  const name = String(strategy.name || 'Saved Strategy').trim() || 'Saved Strategy'
  return normalizeStrategyConfig({
    name,
    signalAsset: normalizeTicker(strategy.signalAsset),
    riskAsset: normalizeTicker(strategy.riskAsset),
    fallbackAsset: normalizeTicker(strategy.fallbackAsset),
    entry: clone(strategy.entry),
    exit: clone(strategy.exit),
    riskFilter: clone(strategy.riskFilter),
    postExitReentry: clone(strategy.postExitReentry),
  })
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}))
}
