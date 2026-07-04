import { describe, expect, it } from 'vitest'
import { searchStocks } from './stockSearchService'

describe('stockSearchService', () => {
  it('searches by ticker or company name', async () => {
    await expect(searchStocks('AAPL')).resolves.toEqual([expect.objectContaining({ ticker: 'AAPL' })])
    await expect(searchStocks('apple')).resolves.toEqual([expect.objectContaining({ name: 'Apple Inc.' })])
  })

  it('returns no results for empty or unknown queries and respects limit', async () => {
    expect(await searchStocks('')).toEqual([])
    expect(await searchStocks('zzzzzz')).toEqual([])
    expect(await searchStocks('a', { limit: 1 })).toHaveLength(1)
  })
})
