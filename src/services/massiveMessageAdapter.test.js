import { describe, expect, it } from 'vitest'
import { normalizeMassiveAggregateMessage } from './massiveMessageAdapter'

describe('normalizeMassiveAggregateMessage', () => {
  it('converts Massive AM aggregate messages into market updates', () => {
    expect(
      normalizeMassiveAggregateMessage({
        ev: 'AM',
        sym: 'SPY',
        o: 500,
        c: 505,
        h: 506,
        l: 499,
        s: 1_700_000_000_000,
        e: 1_700_000_059_999,
      }),
    ).toMatchObject({
      symbol: 'SPY',
      price: 505,
      change: 5,
      changePercent: 1,
      high: 506,
      low: 499,
      startTimestamp: 1_700_000_000_000,
      endTimestamp: 1_700_000_059_999,
      lastUpdated: '2023-11-14T22:14:19.999Z',
    })
  })

  it('ignores unsupported message shapes', () => {
    expect(normalizeMassiveAggregateMessage({ ev: 'status', message: 'ok' })).toBeNull()
  })
})
