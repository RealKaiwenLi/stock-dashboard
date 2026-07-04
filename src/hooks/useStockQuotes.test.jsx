import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useStockQuotes } from './useStockQuotes'

describe('useStockQuotes', () => {
  it('does not start a stream for empty symbols', () => {
    const streamFactory = vi.fn()
    const { result } = renderHook(() => useStockQuotes([], { streamFactory }))

    expect(result.current.connectionStatus).toBe('idle')
    expect(streamFactory).not.toHaveBeenCalled()
  })

  it('loads initial quotes, applies stream updates and cleans up', async () => {
    const close = vi.fn()
    let onUpdate
    const quoteService = vi.fn(async () => ({
      AAPL: { symbol: 'AAPL', price: 214, lastUpdated: '2026-06-05T16:45:00.000Z' },
    }))
    const streamFactory = vi.fn(({ onUpdate: nextOnUpdate }) => {
      onUpdate = nextOnUpdate
      return { close }
    })

    const { result, unmount } = renderHook(() => useStockQuotes(['AAPL'], { quoteService, streamFactory }))

    await waitFor(() => expect(result.current.quotesBySymbol.AAPL.price).toBe(214))

    act(() => {
      onUpdate({ symbol: 'AAPL', price: 215, lastUpdated: '2026-06-05T16:45:01.000Z' })
    })

    expect(result.current.quotesBySymbol.AAPL.price).toBe(215)
    expect(result.current.connectionStatus).toBe('mock-live')

    unmount()
    expect(close).toHaveBeenCalled()
  })
})
