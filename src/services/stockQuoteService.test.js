import { describe, expect, it, vi } from 'vitest'
import { createMockQuoteStream, getStockQuotes } from './stockQuoteService'

describe('stockQuoteService', () => {
  it('returns quote maps and unavailable quotes', async () => {
    await expect(getStockQuotes(['AAPL', 'NOPE'])).resolves.toMatchObject({
      AAPL: { symbol: 'AAPL', price: expect.any(Number) },
      NOPE: { symbol: 'NOPE', price: null, dataMode: 'unavailable' },
    })
  })

  it('streams mock quote updates until closed', () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const stream = createMockQuoteStream({ symbols: ['AAPL'], onUpdate, intervalMs: 100 })

    vi.advanceTimersByTime(100)
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'AAPL', price: expect.any(Number) }))

    stream.close()
    vi.advanceTimersByTime(200)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
