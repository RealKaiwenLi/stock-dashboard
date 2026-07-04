import { describe, expect, it } from 'vitest'
import { getStockBars } from './stockBarsService'

describe('stockBarsService', () => {
  it('returns range-limited mock bars', async () => {
    const oneMonth = await getStockBars('AAPL', '1M')
    const sixMonths = await getStockBars('AAPL', '6M')
    const oneYear = await getStockBars('AAPL', '1Y')

    expect(oneMonth.bars.length).toBeLessThan(sixMonths.bars.length)
    expect(sixMonths.bars.length).toBeLessThan(oneYear.bars.length)
    expect(oneMonth.status).toBe('ok')
  })

  it('returns not found for unknown symbols', async () => {
    await expect(getStockBars('NOPE')).resolves.toEqual({ symbol: 'NOPE', bars: [], status: 'not-found' })
  })
})
