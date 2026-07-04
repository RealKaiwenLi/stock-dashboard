import { describe, expect, it } from 'vitest'
import { getMockStockBars } from '../data/mockStocks'
import {
  buildIndicatorsForBars,
  calculateBollingerBands,
  calculateKDJ,
  calculateMACD,
  calculateMovingAverage,
  calculateVWAP,
} from './technicalIndicators'

describe('technicalIndicators', () => {
  it('returns empty indicator data when inputs are insufficient', () => {
    expect(calculateBollingerBands([1, 2, 3])).toEqual([])
    expect(calculateMACD([1, 2, 3])).toEqual([])
    expect(calculateKDJ(getMockStockBars('AAPL', '1M').slice(0, 3))).toEqual([])
  })

  it('calculates Bollinger middle as the SMA', () => {
    const closes = Array.from({ length: 20 }, (_, index) => index + 1)
    const bands = calculateBollingerBands(closes)

    expect(bands.at(-1).middle).toBe(10.5)
    expect(bands.at(-1).upper).toBeGreaterThan(bands.at(-1).middle)
    expect(bands.at(-1).lower).toBeLessThan(bands.at(-1).middle)
  })

  it('calculates MACD and KDJ fields aligned to bar time', () => {
    const bars = getMockStockBars('AAPL', '1Y')
    const indicators = buildIndicatorsForBars(bars)

    expect(indicators.macd.at(-1)).toEqual(
      expect.objectContaining({ time: expect.any(Number), macd: expect.any(Number), signal: expect.any(Number), histogram: expect.any(Number) }),
    )
    expect(indicators.kdj.at(-1).j).toBeCloseTo(3 * indicators.kdj.at(-1).k - 2 * indicators.kdj.at(-1).d, 3)
    expect(indicators.bollinger.at(-1)).toEqual(
      expect.objectContaining({ time: expect.any(Number), upper: expect.any(Number), middle: expect.any(Number), lower: expect.any(Number) }),
    )
    expect(indicators.vwap.at(-1)).toEqual(expect.objectContaining({ time: expect.any(Number), vwap: expect.any(Number) }))
    expect(indicators.movingAverages.ma20.at(-1)).toEqual(expect.objectContaining({ time: expect.any(Number), value: expect.any(Number) }))
    expect(indicators.movingAverages.ma50.at(-1)).toEqual(expect.objectContaining({ time: expect.any(Number), value: expect.any(Number) }))
  })

  it('calculates cumulative VWAP from typical price and volume', () => {
    const bars = [
      { high: 11, low: 9, close: 10, volume: 100 },
      { high: 22, low: 18, close: 20, volume: 300 },
    ]

    expect(calculateVWAP(bars)).toEqual([{ vwap: 10 }, { vwap: 17.5 }])
  })

  it('calculates moving averages with insufficient data protection', () => {
    expect(calculateMovingAverage([1, 2, 3], 5)).toEqual([])
    expect(calculateMovingAverage([1, 2, 3, 4, 5], 5).at(-1)).toEqual({ value: 3 })
  })
})
