import { describe, expect, it } from 'vitest'
import { getStockSummary } from './stockSummaryService'

describe('stockSummaryService', () => {
  it('returns Yahoo-style quote summary data without earnings date or target estimate', async () => {
    const result = await getStockSummary('NVDA')

    expect(result.status).toBe('ok')
    expect(result.summary).toEqual(
      expect.objectContaining({
        previousClose: expect.any(Number),
        open: expect.any(Number),
        bid: expect.any(Number),
        bidSize: expect.any(Number),
        ask: expect.any(Number),
        askSize: expect.any(Number),
        dayRange: { low: expect.any(Number), high: expect.any(Number) },
        week52Range: { low: expect.any(Number), high: expect.any(Number) },
        volume: expect.any(Number),
        averageVolume: expect.any(Number),
        marketCap: expect.any(Number),
        beta: expect.any(Number),
        peRatio: expect.any(Number),
        eps: expect.any(Number),
        forwardDividend: expect.any(Number),
        dividendYield: expect.any(Number),
        exDividendDate: expect.any(String),
      }),
    )
    expect(result.summary).not.toHaveProperty('earningsDate')
    expect(result.summary).not.toHaveProperty('targetEstimate1Y')
  })

  it('returns not found for unknown symbols', async () => {
    await expect(getStockSummary('NOPE')).resolves.toEqual({ symbol: 'NOPE', status: 'not-found', summary: null })
  })
})
