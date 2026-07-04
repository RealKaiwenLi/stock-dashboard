import { describe, expect, it } from 'vitest'
import { mockDashboardData } from './mockMarketData'

describe('mockDashboardData', () => {
  it('provides MVP market symbols and data freshness metadata', () => {
    expect(mockDashboardData.indices.map((item) => item.symbol)).toEqual([
      'SPY',
      'QQQ',
      'DIA',
    ])
    expect(mockDashboardData.vix.symbol).toBe('VIX')
    expect(mockDashboardData.dataDelayMinutes).toBe(15)
    expect(mockDashboardData.marketStatus).toMatch(/盘中|盘前|盘后|已收盘/)
  })
})
