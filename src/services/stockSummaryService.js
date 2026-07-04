import { getMockStockBars, mockStockFundamentals, mockStockQuotes } from '../data/mockStocks'

export async function getStockSummary(symbol) {
  const normalized = String(symbol ?? '').toUpperCase()
  const quote = mockStockQuotes[normalized]
  const fundamentals = mockStockFundamentals[normalized]

  if (!quote || !fundamentals) {
    return { symbol: normalized, status: 'not-found', summary: null }
  }

  const bars = getMockStockBars(normalized, '1Y')
  const dayRange = getRange([{ high: quote.price + Math.abs(quote.change) * 0.8, low: quote.price - Math.abs(quote.change) * 1.2 }])
  const week52Range = getRange(bars)
  const averageVolume = Math.round(bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length)

  return {
    symbol: normalized,
    status: 'ok',
    summary: {
      previousClose: quote.previousClose,
      open: quote.open,
      bid: quote.bid,
      bidSize: quote.bidSize,
      ask: quote.ask,
      askSize: quote.askSize,
      dayRange,
      week52Range,
      volume: bars.at(-1)?.volume ?? null,
      averageVolume,
      marketCap: fundamentals.marketCap,
      beta: fundamentals.beta,
      peRatio: fundamentals.peRatio,
      eps: fundamentals.eps,
      forwardDividend: fundamentals.forwardDividend,
      dividendYield: fundamentals.dividendYield,
      exDividendDate: fundamentals.exDividendDate,
    },
  }
}

function getRange(bars) {
  if (!bars.length) return { low: null, high: null }
  return {
    low: Math.min(...bars.map((bar) => bar.low)),
    high: Math.max(...bars.map((bar) => bar.high)),
  }
}
