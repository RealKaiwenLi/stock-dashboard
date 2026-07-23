import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { fetchDailyRecommendations } from './services/dailyRecommendationsApi'
import { fetchWeeklyBacktests } from './services/weeklyBacktestsApi'

vi.mock('./services/dailyRecommendationsApi', () => ({
  fetchDailyRecommendations: vi.fn(),
  getRollingMonthRange: () => ({ from: '2025-08-01', to: '2026-07-31' }),
  mergeDailyRecommendationData: (_current, incoming) => incoming,
  rangeIncludesMonth: () => true,
  buildCalendarDays: () => [
    { key: '2026-07-01', date: '2026-07-01', day: 1 },
    { key: '2026-07-04', date: '2026-07-04', day: 4 },
  ],
}))

vi.mock('./services/weeklyBacktestsApi', () => ({ fetchWeeklyBacktests: vi.fn() }))

describe('DashboardHome', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    fetchDailyRecommendations.mockResolvedValue({
      items: [{ date: '2026-07-04', recommendedHolding: 'QLD', action: 'HOLD', holdForNextOpen: 'QLD', latestBarDate: '2026-07-02', notionUrl: 'https://notion.so/daily' }],
      source: 'notion', lastSyncedAt: '2026-07-04T09:00:00-07:00',
    })
    fetchWeeklyBacktests.mockResolvedValue({
      items: [{
        reportDate: '2026-07-17', latestBarDate: '2026-07-17', title: 'QQQ / TQQQ 策略周度验证',
        signalSymbol: 'QQQ', riskSymbol: 'TQQQ', generatedAt: '2026-07-17T10:30:43-07:00',
        summary: [{ rank: 1, strategy: 'MACD strategy', score: 96.64, cagrPct: 34.72, maxDrawdownPct: -48.69, sharpe: 0.96, rolling5yWinRate: 100, switchesPerYear: 10.68 }],
      }], source: 'notion', lastSyncedAt: '2026-07-18T00:00:00Z',
    })
  })

  it('routes to the watchlist and stock detail pages', () => {
    window.history.pushState({}, '', '/watchlist'); render(<App />)
    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument()
    cleanup(); window.history.pushState({}, '', '/stocks/AAPL'); render(<App />)
    expect(screen.getByRole('heading', { name: 'AAPL' })).toBeInTheDocument()
  })

  it('keeps only daily recommendations and weekly backtests on the homepage', async () => {
    render(<App />)
    expect(await screen.findByLabelText('Latest recommendation')).toHaveTextContent('QLD')
    expect(await screen.findByRole('region', { name: 'Weekly Backtests' })).toHaveTextContent('MACD strategy')
    expect(screen.queryByText('Market Pulse')).not.toBeInTheDocument()
    expect(screen.queryByText('VIX Risk')).not.toBeInTheDocument()
    expect(screen.queryByText('Fear & Greed')).not.toBeInTheDocument()
  })

  it('renders top bar data status', () => {
    render(<App />)
    expect(screen.getByText('US Market Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Data delayed 15 minutes')).toBeInTheDocument()
    expect(screen.getByText('Mock live')).toBeInTheDocument()
  })

  it('switches both homepage widgets to Chinese without refetching', async () => {
    const user = userEvent.setup(); render(<App />)
    await screen.findByText('Weekly Backtests')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh')
    expect(screen.getByRole('combobox', { name: '语言' })).toHaveValue('zh')
    expect(screen.getByText('每日推荐持仓')).toBeInTheDocument()
    expect(screen.getByText('每周回测')).toBeInTheDocument()
    expect(fetchDailyRecommendations).toHaveBeenCalledTimes(1)
    expect(fetchWeeklyBacktests).toHaveBeenCalledTimes(1)
  })
})
