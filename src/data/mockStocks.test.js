import { describe, expect, it } from 'vitest'
import { getMockStockBars, mockStockDirectory, mockStockQuotes } from './mockStocks'

describe('mockStocks', () => {
  it('includes the core mock symbols', () => {
    expect(mockStockDirectory.map((stock) => stock.ticker)).toEqual(
      expect.arrayContaining(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ', 'DIA']),
    )
  })

  it('has a quote for every mock symbol', () => {
    mockStockDirectory.forEach((stock) => {
      expect(mockStockQuotes[stock.ticker]).toMatchObject({ symbol: stock.ticker, dataMode: 'mock-live' })
    })
  })

  it('generates OHLCV bars with enough 1Y data for indicators', () => {
    const bars = getMockStockBars('AAPL', '1Y')

    expect(bars.length).toBeGreaterThanOrEqual(252)
    expect(bars[0]).toEqual(
      expect.objectContaining({
        time: expect.any(Number),
        open: expect.any(Number),
        high: expect.any(Number),
        low: expect.any(Number),
        close: expect.any(Number),
        volume: expect.any(Number),
      }),
    )
  })
})
