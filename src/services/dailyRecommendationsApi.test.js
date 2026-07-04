import { describe, expect, it, vi } from 'vitest'
import {
  buildCalendarDays,
  fetchDailyRecommendations,
  getMonthRange,
  getRollingMonthRange,
  mergeDailyRecommendationData,
  rangeIncludesMonth,
} from './dailyRecommendationsApi'

describe('dailyRecommendationsApi', () => {
  it('fetches daily recommendations with a date range', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ date: '2026-07-04', recommendedHolding: 'QLD' }], source: 'notion' }),
    })

    const result = await fetchDailyRecommendations({ from: '2026-07-01', to: '2026-07-31', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith('/api/daily-recommendations?from=2026-07-01&to=2026-07-31')
    expect(result.items).toHaveLength(1)
    expect(result.source).toBe('notion')
  })

  it('throws a coded error for failed API responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'NOTION_UNCONFIGURED', message: 'Missing env' }),
    })

    await expect(fetchDailyRecommendations({ fetchImpl })).rejects.toMatchObject({
      code: 'NOTION_UNCONFIGURED',
      message: 'Missing env',
    })
  })

  it('builds month ranges and calendar days without a date library', () => {
    expect(getMonthRange(new Date(2024, 1, 15))).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(getRollingMonthRange(new Date(2026, 6, 15))).toEqual({ from: '2025-08-01', to: '2026-07-31' })
    expect(rangeIncludesMonth({ from: '2025-08-01', to: '2026-07-31' }, new Date(2026, 0, 1))).toBe(true)
    expect(rangeIncludesMonth({ from: '2025-08-01', to: '2026-07-31' }, new Date(2025, 6, 1))).toBe(false)

    const days = buildCalendarDays(new Date(2026, 6, 1))

    expect(days[0]).toMatchObject({ empty: true })
    expect(days.find((day) => day.date === '2026-07-04')).toMatchObject({ day: 4 })
    expect(days.at(-1)).toMatchObject({ date: '2026-07-31' })
  })

  it('merges recommendation responses by date for frontend cache', () => {
    const merged = mergeDailyRecommendationData(
      { items: [{ date: '2026-07-01', recommendedHolding: 'QQQ' }] },
      {
        items: [
          { date: '2026-07-01', recommendedHolding: 'QLD' },
          { date: '2026-07-02', recommendedHolding: 'TQQQ' },
        ],
        lastSyncedAt: '2026-07-04T09:00:00-07:00',
      },
    )

    expect(merged.items).toEqual([
      { date: '2026-07-01', recommendedHolding: 'QLD' },
      { date: '2026-07-02', recommendedHolding: 'TQQQ' },
    ])
    expect(merged.lastSyncedAt).toBe('2026-07-04T09:00:00-07:00')
  })
})
