import { describe, expect, it, vi } from 'vitest'
import { addWatchlistItem, readWatchlist, removeWatchlistItem, WATCHLIST_STORAGE_KEY } from './watchlistStorage'

function createStorage(initialValue) {
  const store = new Map(initialValue ? [[WATCHLIST_STORAGE_KEY, initialValue]] : [])
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
  }
}

describe('watchlistStorage', () => {
  it('returns an empty watchlist for empty or corrupt storage', () => {
    expect(readWatchlist(createStorage())).toEqual([])
    expect(readWatchlist(createStorage('{nope'))).toEqual([])
  })

  it('adds, normalizes and de-duplicates symbols', () => {
    const storage = createStorage()

    addWatchlistItem({ symbol: 'aapl', name: 'Apple Inc.', primaryExchange: 'XNAS', type: 'CS' }, storage)
    addWatchlistItem({ symbol: 'AAPL', name: 'Apple Duplicate' }, storage)

    expect(readWatchlist(storage)).toEqual([
      expect.objectContaining({ symbol: 'AAPL', name: 'Apple Inc.', primaryExchange: 'XNAS', type: 'CS' }),
    ])
  })

  it('removes symbols and survives storage write errors', () => {
    const storage = createStorage()
    addWatchlistItem({ symbol: 'AAPL', name: 'Apple Inc.' }, storage)
    removeWatchlistItem('aapl', storage)

    expect(readWatchlist(storage)).toEqual([])

    const brokenStorage = { getItem: vi.fn(() => null), setItem: vi.fn(() => { throw new Error('full') }) }
    expect(addWatchlistItem({ symbol: 'MSFT' }, brokenStorage)).toEqual([expect.objectContaining({ symbol: 'MSFT' })])
  })
})
