import { mockStockDirectory } from '../data/mockStocks'

export async function searchStocks(query, { limit = 20, directory = mockStockDirectory } = {}) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  return directory
    .filter((stock) => stock.ticker.toLowerCase().includes(normalized) || stock.name.toLowerCase().includes(normalized))
    .slice(0, limit)
}
