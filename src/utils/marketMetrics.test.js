import { describe, expect, it } from 'vitest'
import {
  calculateMarketPulse,
  calculateMarketStyle,
  getFearGreedStatus,
  getMarketPulseStatus,
  getVixRiskLevel,
} from './marketMetrics'

const buildIndex = (overrides) => ({
  symbol: 'SPY',
  price: 100,
  changePercent: 1,
  returns: { fiveDay: 1, oneMonth: 1 },
  movingAverages: { twentyDay: 99, fiftyDay: 98 },
  ...overrides,
})

describe('getVixRiskLevel', () => {
  it.each([
    [14.99, '平静', 'green', 100],
    [15, '正常', 'lime', 80],
    [20, '警惕', 'yellow', 50],
    [30, '紧张', 'orange', 20],
    [40, '恐慌', 'red', 0],
  ])('maps VIX %s to %s', (value, label, color, score) => {
    expect(getVixRiskLevel(value)).toMatchObject({ label, color, score })
  })
})

describe('market pulse', () => {
  it('calculates weighted pulse score from SPY, QQQ, DIA and VIX', () => {
    const score = calculateMarketPulse({
      indices: [
        buildIndex({ symbol: 'SPY' }),
        buildIndex({ symbol: 'QQQ', movingAverages: { twentyDay: 99, fiftyDay: 105 } }),
        buildIndex({ symbol: 'DIA', changePercent: -0.2, returns: { fiveDay: 1, oneMonth: 1 } }),
      ],
      vix: { value: 18 },
    })

    expect(score).toBe(86)
  })

  it.each([
    [30, '偏弱', 'red'],
    [31, '中性', 'yellow'],
    [60, '中性', 'yellow'],
    [61, '偏强', 'green'],
  ])('maps pulse score %s to %s', (score, label, color) => {
    expect(getMarketPulseStatus(score)).toMatchObject({ label, color })
  })
})

describe('calculateMarketStyle', () => {
  it('detects technology leadership', () => {
    expect(
      calculateMarketStyle({
        spy: buildIndex({ symbol: 'SPY', changePercent: 0.4, returns: { fiveDay: 0.6, oneMonth: 1 } }),
        qqq: buildIndex({ symbol: 'QQQ', changePercent: 1.4, returns: { fiveDay: 1.8, oneMonth: 2 } }),
        dia: buildIndex({ symbol: 'DIA', changePercent: 0.2, returns: { fiveDay: 0.3, oneMonth: 0.5 } }),
      }),
    ).toMatchObject({ label: '科技股领涨' })
  })

  it('detects blue-chip leadership', () => {
    expect(
      calculateMarketStyle({
        spy: buildIndex({ symbol: 'SPY', changePercent: 0.2, returns: { fiveDay: 0.3, oneMonth: 0.5 } }),
        qqq: buildIndex({ symbol: 'QQQ', changePercent: 0.1, returns: { fiveDay: 0.2, oneMonth: 0.2 } }),
        dia: buildIndex({ symbol: 'DIA', changePercent: 1.2, returns: { fiveDay: 1.5, oneMonth: 2 } }),
      }),
    ).toMatchObject({ label: '蓝筹股领涨' })
  })

  it('detects balanced movement', () => {
    expect(
      calculateMarketStyle({
        spy: buildIndex({ symbol: 'SPY', changePercent: 0.2, returns: { fiveDay: 0.2, oneMonth: 0.4 } }),
        qqq: buildIndex({ symbol: 'QQQ', changePercent: 0.3, returns: { fiveDay: 0.3, oneMonth: 0.5 } }),
        dia: buildIndex({ symbol: 'DIA', changePercent: 0.1, returns: { fiveDay: 0.2, oneMonth: 0.3 } }),
      }),
    ).toMatchObject({ label: '走势均衡' })
  })

  it('detects broad weakness', () => {
    expect(
      calculateMarketStyle({
        spy: buildIndex({ symbol: 'SPY', changePercent: -0.4, returns: { fiveDay: -0.6, oneMonth: 1 } }),
        qqq: buildIndex({ symbol: 'QQQ', changePercent: -0.5, returns: { fiveDay: -1.2, oneMonth: 2 } }),
        dia: buildIndex({ symbol: 'DIA', changePercent: -0.2, returns: { fiveDay: -0.4, oneMonth: 0.5 } }),
      }),
    ).toMatchObject({ label: '整体偏弱' })
  })
})

describe('getFearGreedStatus', () => {
  it.each([
    [20, '极度恐惧', 'red'],
    [21, '恐惧', 'orange'],
    [41, '中性', 'yellow'],
    [61, '贪婪', 'green'],
    [81, '极度贪婪', 'darkGreen'],
  ])('maps score %s to %s', (score, label, color) => {
    expect(getFearGreedStatus(score)).toMatchObject({ label, color })
  })
})
