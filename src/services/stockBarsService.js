import { getMockStockBars, mockStockDirectory } from '../data/mockStocks'

export async function getStockBars(symbol, range = '1Y') {
  const normalized = String(symbol ?? '').toUpperCase()
  const stock = mockStockDirectory.find((item) => item.ticker === normalized)
  if (!stock) return { symbol: normalized, bars: [], status: 'not-found' }

  return { symbol: normalized, bars: getMockStockBars(normalized, range), status: 'ok' }
}
