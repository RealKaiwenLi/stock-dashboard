import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMassiveMarketData } from './useMassiveMarketData'

vi.mock('../services/massiveWebSocket', () => ({
  createMassiveMarketSocket: vi.fn(({ onUpdate, onStatus }) => {
    onStatus('connected')
    setTimeout(() => {
      onUpdate({ symbol: 'SPY', price: 601, change: 3, changePercent: 0.5, lastUpdated: '2026-06-03T20:00:00.000Z' })
    }, 0)
    return { close: vi.fn() }
  }),
}))

describe('useMassiveMarketData', () => {
  it('starts with mock data and applies WebSocket updates', async () => {
    const { result } = renderHook(() => useMassiveMarketData({ apiKey: 'demo-key' }))

    expect(result.current.indices.map((item) => item.symbol)).toEqual(['SPY', 'QQQ', 'DIA'])

    await waitFor(() => {
      expect(result.current.indices.find((item) => item.symbol === 'SPY').price).toBe(601)
    })
    expect(result.current.connectionStatus).toBe('connected')
  })
})
