import { describe, expect, it, vi } from 'vitest'
import { fetchWeeklyBacktests } from './weeklyBacktestsApi'

describe('fetchWeeklyBacktests', () => {
  it('requests recent weekly reports and normalizes the payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{ reportDate: '2026-07-17' }] }),
    }))
    await expect(fetchWeeklyBacktests({ limit: 8, fetchImpl })).resolves.toMatchObject({
      items: [{ reportDate: '2026-07-17' }],
      source: 'notion',
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/weekly-backtests?limit=8')
  })

  it('throws the backend message for an error response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'NOTION_FAILED', message: 'Notion failed' }),
    }))
    await expect(fetchWeeklyBacktests({ fetchImpl })).rejects.toThrow('Notion failed')
  })
})
