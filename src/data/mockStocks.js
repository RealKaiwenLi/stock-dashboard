const DAY_MS = 24 * 60 * 60 * 1000

export const mockStockDirectory = [
  { ticker: 'AAPL', name: 'Apple Inc.', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'TSLA', name: 'Tesla Inc.', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'META', name: 'Meta Platforms Inc.', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', primaryExchange: 'XNAS', market: 'stocks', type: 'CS', active: true, currency: 'USD' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', primaryExchange: 'ARCX', market: 'stocks', type: 'ETF', active: true, currency: 'USD' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', primaryExchange: 'XNAS', market: 'stocks', type: 'ETF', active: true, currency: 'USD' },
  { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF Trust', primaryExchange: 'ARCX', market: 'stocks', type: 'ETF', active: true, currency: 'USD' },
]

export const mockStockQuotes = {
  AAPL: buildQuote('AAPL', 214.18, 2.36),
  MSFT: buildQuote('MSFT', 491.42, 3.18),
  NVDA: buildQuote('NVDA', 141.72, 1.94),
  TSLA: buildQuote('TSLA', 184.09, -2.41),
  AMZN: buildQuote('AMZN', 186.57, 1.22),
  META: buildQuote('META', 641.31, 4.78),
  GOOGL: buildQuote('GOOGL', 176.83, 0.92),
  SPY: buildQuote('SPY', 592.18, 4.26),
  QQQ: buildQuote('QQQ', 528.64, 6.51),
  DIA: buildQuote('DIA', 438.32, 1.18),
}

export const mockStockFundamentals = {
  AAPL: buildFundamentals({ marketCap: 3_280_000_000_000, beta: 1.18, peRatio: 32.7, eps: 6.55, forwardDividend: 1.04, dividendYield: 0.49, exDividendDate: '2026-05-11' }),
  MSFT: buildFundamentals({ marketCap: 3_650_000_000_000, beta: 0.91, peRatio: 36.2, eps: 13.58, forwardDividend: 3.64, dividendYield: 0.74, exDividendDate: '2026-05-20' }),
  NVDA: buildFundamentals({ marketCap: 3_480_000_000_000, beta: 2.24, peRatio: 33.49, eps: 6.53, forwardDividend: 0.04, dividendYield: 0.03, exDividendDate: '2026-06-04' }),
  TSLA: buildFundamentals({ marketCap: 590_000_000_000, beta: 2.08, peRatio: 91.4, eps: 2.01, forwardDividend: null, dividendYield: null, exDividendDate: null }),
  AMZN: buildFundamentals({ marketCap: 1_980_000_000_000, beta: 1.31, peRatio: 34.8, eps: 5.36, forwardDividend: null, dividendYield: null, exDividendDate: null }),
  META: buildFundamentals({ marketCap: 1_620_000_000_000, beta: 1.19, peRatio: 28.6, eps: 22.42, forwardDividend: 2.10, dividendYield: 0.33, exDividendDate: '2026-06-16' }),
  GOOGL: buildFundamentals({ marketCap: 2_170_000_000_000, beta: 1.02, peRatio: 25.7, eps: 6.88, forwardDividend: 0.80, dividendYield: 0.45, exDividendDate: '2026-06-09' }),
  SPY: buildFundamentals({ marketCap: 560_000_000_000, beta: 1.0, peRatio: null, eps: null, forwardDividend: 6.92, dividendYield: 1.17, exDividendDate: '2026-06-20' }),
  QQQ: buildFundamentals({ marketCap: 320_000_000_000, beta: 1.0, peRatio: null, eps: null, forwardDividend: 3.08, dividendYield: 0.58, exDividendDate: '2026-06-23' }),
  DIA: buildFundamentals({ marketCap: 36_000_000_000, beta: 1.0, peRatio: null, eps: null, forwardDividend: 7.18, dividendYield: 1.64, exDividendDate: '2026-06-20' }),
}

function buildQuote(symbol, price, change) {
  const previousClose = price - change
  return {
    symbol,
    price,
    change,
    previousClose: round(previousClose),
    open: round(previousClose * 0.997),
    bid: round(price - 0.08),
    bidSize: 100,
    ask: round(price + 0.08),
    askSize: 400,
    changePercent: Number((change / previousClose * 100).toFixed(2)),
    lastUpdated: '2026-06-05T16:45:00.000Z',
    dataMode: 'mock-live',
  }
}

function buildFundamentals(values) {
  return values
}

function symbolSeed(symbol) {
  return [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

export function generateMockBars(symbol, count = 280) {
  const quote = mockStockQuotes[symbol.toUpperCase()]
  const endPrice = quote?.price ?? 100
  const seed = symbolSeed(symbol)
  const startTime = Date.UTC(2025, 4, 1)
  let close = endPrice * 0.72

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) / 9) * 1.8
    const drift = (endPrice - close) / Math.max(1, count - index)
    const open = close + Math.sin((index + seed) / 5) * 0.55
    close = Math.max(1, close + drift + wave * 0.18)
    const high = Math.max(open, close) + 0.8 + Math.abs(Math.sin(index / 3)) * 1.1
    const low = Math.min(open, close) - 0.8 - Math.abs(Math.cos(index / 4)) * 1.1

    return {
      time: Math.floor((startTime + index * DAY_MS) / 1000),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(12_000_000 + Math.abs(Math.sin((index + seed) / 6)) * 38_000_000),
    }
  })
}

export const mockStockBarsBySymbol = Object.fromEntries(
  mockStockDirectory.map((stock) => [stock.ticker, generateMockBars(stock.ticker)]),
)

export function getMockStockBars(symbol, range = '1Y') {
  const bars = mockStockBarsBySymbol[symbol.toUpperCase()] ?? []
  const limits = { '1M': 23, '6M': 126, '1Y': 252 }
  return bars.slice(-(limits[range] ?? limits['1Y']))
}

function round(value) {
  return Number(value.toFixed(2))
}
