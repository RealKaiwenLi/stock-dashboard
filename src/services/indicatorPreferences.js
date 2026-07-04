export const INDICATOR_PREFERENCES_KEY = 'stock-dashboard.indicators.v1'

export const defaultIndicatorPreferences = {
  vwap: false,
  bollinger: false,
  macd: true,
  kdj: false,
  movingAverages: { ma20: false, ma50: false, ma100: false, ma200: false },
}

export function readIndicatorPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(INDICATOR_PREFERENCES_KEY)
    if (!raw) return defaultIndicatorPreferences
    return normalizePreferences(JSON.parse(raw))
  } catch {
    return defaultIndicatorPreferences
  }
}

export function writeIndicatorPreferences(preferences, storage = globalThis.localStorage) {
  const normalized = normalizePreferences(preferences)
  try {
    storage?.setItem(INDICATOR_PREFERENCES_KEY, JSON.stringify(normalized))
  } catch {
    return normalized
  }
  return normalized
}

export function normalizePreferences(preferences) {
  return {
    ...defaultIndicatorPreferences,
    ...pickBooleans(preferences, ['vwap', 'bollinger', 'macd', 'kdj']),
    movingAverages: {
      ...defaultIndicatorPreferences.movingAverages,
      ...pickBooleans(preferences?.movingAverages, ['ma20', 'ma50', 'ma100', 'ma200']),
    },
  }
}

function pickBooleans(source, keys) {
  return Object.fromEntries(keys.filter((key) => typeof source?.[key] === 'boolean').map((key) => [key, source[key]]))
}
