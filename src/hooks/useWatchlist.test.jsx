import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WATCHLIST_STORAGE_KEY } from '../services/watchlistStorage'
import { useWatchlist } from './useWatchlist'

function createStorage(initialItems = []) {
  const store = new Map(initialItems.length ? [[WATCHLIST_STORAGE_KEY, JSON.stringify(initialItems)]] : [])
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
  }
}

describe('useWatchlist', () => {
  it('reads initial storage and adds/removes items', () => {
    const storage = createStorage([{ symbol: 'AAPL', name: 'Apple Inc.' }])
    const { result } = renderHook(() => useWatchlist({ storage }))

    expect(result.current.symbols).toEqual(['AAPL'])

    act(() => {
      result.current.addItem({ symbol: 'MSFT', name: 'Microsoft Corporation' })
    })

    expect(result.current.symbols).toEqual(['AAPL', 'MSFT'])

    act(() => {
      result.current.addItem({ symbol: 'msft', name: 'Duplicate' })
    })

    expect(result.current.symbols).toEqual(['AAPL', 'MSFT'])

    act(() => {
      result.current.removeItem('aapl')
    })

    expect(result.current.symbols).toEqual(['MSFT'])
    expect(storage.setItem).toHaveBeenCalled()
  })
})
