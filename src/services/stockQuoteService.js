import { mockStockQuotes } from '../data/mockStocks'

export async function getStockQuotes(symbols) {
  return Object.fromEntries(
    symbols
      .map((symbol) => String(symbol).toUpperCase())
      .map((symbol) => [symbol, mockStockQuotes[symbol] ? { ...mockStockQuotes[symbol] } : unavailableQuote(symbol)]),
  )
}

export function createMockQuoteStream({
  symbols,
  onUpdate,
  intervalMs = 2_000,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  const normalizedSymbols = symbols.map((symbol) => String(symbol).toUpperCase())
  let tick = 0
  const timer = setIntervalFn(() => {
    tick += 1
    normalizedSymbols.forEach((symbol) => {
      const base = mockStockQuotes[symbol]
      if (!base) return
      const drift = Math.sin(tick + symbol.length) * 0.0015
      const price = Number((base.price * (1 + drift)).toFixed(2))
      const change = Number((price - (base.price - base.change)).toFixed(2))
      onUpdate({
        ...base,
        price,
        change,
        changePercent: Number(((change / (price - change)) * 100).toFixed(2)),
        lastUpdated: new Date(Date.UTC(2026, 5, 5, 16, 45, tick)).toISOString(),
      })
    })
  }, intervalMs)

  return {
    close() {
      clearIntervalFn(timer)
    },
  }
}

function unavailableQuote(symbol) {
  return { symbol, price: null, change: null, changePercent: null, lastUpdated: null, dataMode: 'unavailable' }
}
