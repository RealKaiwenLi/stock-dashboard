import { describe, expect, it, vi } from 'vitest'
import {
  readStrategyFavorites,
  removeStrategyFavorite,
  saveStrategyFavorite,
  STRATEGY_FAVORITES_STORAGE_KEY,
} from './strategyFavorites'

function createStorage(initialValue) {
  const store = new Map(initialValue ? [[STRATEGY_FAVORITES_STORAGE_KEY, initialValue]] : [])
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
  }
}

const strategy = {
  id: 'live-strategy-id',
  name: 'EMA15 + Hist',
  signalAsset: 'qqq',
  riskAsset: 'tqqq',
  fallbackAsset: 'qqq',
  entry: { logic: 'and', rules: [{ type: 'macd_cross', fast: 12, slow: 26, signal: 9 }] },
  exit: { logic: 'and', rules: [{ type: 'ma_break', maType: 'ema', window: 15 }] },
}

describe('strategyFavorites', () => {
  it('returns empty favorites for empty or corrupt storage', () => {
    expect(readStrategyFavorites(createStorage())).toEqual([])
    expect(readStrategyFavorites(createStorage('{nope'))).toEqual([])
  })

  it('saves normalized strategy templates without the live strategy id', () => {
    const storage = createStorage()

    const favorites = saveStrategyFavorite(strategy, storage)

    expect(favorites).toHaveLength(1)
    expect(favorites[0].strategy).toEqual(expect.objectContaining({
      name: 'EMA15 + Hist',
      signalAsset: 'QQQ',
      riskAsset: 'TQQQ',
      fallbackAsset: 'QQQ',
    }))
    expect(favorites[0].strategy.id).toBeUndefined()
    expect(readStrategyFavorites(storage)).toEqual(favorites)
  })

  it('de-duplicates identical templates and removes favorites', () => {
    const storage = createStorage()

    const [favorite] = saveStrategyFavorite(strategy, storage)
    saveStrategyFavorite({ ...strategy, id: 'another-live-id' }, storage)

    expect(readStrategyFavorites(storage)).toHaveLength(1)
    expect(removeStrategyFavorite(favorite.id, storage)).toEqual([])
  })

  it('survives storage write errors', () => {
    const brokenStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('full')
      }),
    }

    expect(saveStrategyFavorite(strategy, brokenStorage)).toHaveLength(1)
  })
})
