import { describe, expect, it, vi } from 'vitest'
import { fetchFearGreedData, normalizeFearGreedResponse } from './fearGreedApi'

const apiResponse = {
  ts: 1_785_888_000,
  market: { '^VIX': { price: 18.2 } },
  score: {
    score: 68,
    components: [
      { name: 'VOLATILITY', val: 70, wt: 25, desc: 'VIX vs 20-day average', raw: 'VIX 18 / MA20 19' },
    ],
  },
}

describe('normalizeFearGreedResponse', () => {
  it('normalizes API score, status, VIX and components', () => {
    expect(normalizeFearGreedResponse(apiResponse)).toMatchObject({
      score: 68,
      status: { label: '贪婪' },
      vix: { value: 18.2 },
      components: [
        {
          name: 'VOLATILITY',
          value: 70,
          weight: 25,
          description: 'VIX vs 20-day average',
          raw: 'VIX 18 / MA20 19',
        },
      ],
      updatedAt: '2026-08-05T00:00:00.000Z',
    })
  })
})

describe('fetchFearGreedData', () => {
  it('fetches and normalizes FearGreedChart API data', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => apiResponse,
    }))

    await expect(fetchFearGreedData({ fetchImpl })).resolves.toMatchObject({ score: 68 })
    expect(fetchImpl).toHaveBeenCalledWith('https://feargreedchart.com/api/?action=all')
  })

  it('throws when the API response is not ok', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }))

    await expect(fetchFearGreedData({ fetchImpl })).rejects.toThrow('FearGreedChart API failed: 500')
  })
})
