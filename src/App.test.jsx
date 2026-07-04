import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockDashboardData } from './data/mockMarketData'
import { getFearGreedData } from './services/fearGreedService'
import { useMassiveMarketData } from './hooks/useMassiveMarketData'

vi.mock('./hooks/useMassiveMarketData', () => ({
  useMassiveMarketData: vi.fn(),
}))

vi.mock('./services/fearGreedService', () => ({
  getFearGreedData: vi.fn(),
}))

describe('DashboardHome', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    window.history.pushState({}, '', '/')
    useMassiveMarketData.mockReturnValue({
      ...mockDashboardData,
      connectionStatus: 'connected',
    })
    getFearGreedData.mockResolvedValue(null)
  })

  it('routes to the watchlist and stock detail pages', () => {
    window.history.pushState({}, '', '/watchlist')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument()

    cleanup()
    window.history.pushState({}, '', '/stocks/AAPL')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'AAPL' })).toBeInTheDocument()
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
  })

  it('renders SPY, QQQ and DIA index cards with line charts and no candlesticks', () => {
    render(<App />)

    expect(screen.getByRole('article', { name: /SPY S&P 500/ })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /QQQ Nasdaq 100/ })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /DIA Dow Jones/ })).toBeInTheDocument()
    expect(screen.getAllByText('Current price')).toHaveLength(3)
    expect(screen.getAllByText('5D performance')).toHaveLength(3)
    expect(screen.getAllByText('1M performance')).toHaveLength(3)
    expect(screen.getByRole('img', { name: /SPY intraday line chart/ })).toBeInTheDocument()
    expect(screen.queryByText('蜡烛图')).not.toBeInTheDocument()
  })

  it('renders VIX risk gauge with current value and risk level', () => {
    render(<App />)

    expect(screen.getByText('VIX Risk')).toBeInTheDocument()
    expect(screen.getByText('18.40')).toBeInTheDocument()
    expect(screen.getByLabelText('VIX Risk')).toHaveTextContent('Normal')
    expect(screen.getByLabelText('VIX Risk segments')).toBeInTheDocument()
  })

  it('renders market pulse score, status and calculation entry', () => {
    render(<App />)

    expect(screen.getByText('Market Pulse')).toBeInTheDocument()
    expect(screen.getByText('97')).toBeInTheDocument()
    expect(screen.getByLabelText('Market Pulse')).toHaveTextContent('Strong')
    expect(screen.getByLabelText('Market Pulse segments')).toHaveTextContent('Weak')
    expect(screen.getByLabelText('Market Pulse segments')).toHaveTextContent('Neutral')
    expect(screen.getByLabelText('Market Pulse segments')).toHaveTextContent('Strong')
    expect(screen.getByRole('button', { name: 'Market Pulse How is this calculated?' })).toBeInTheDocument()
  })

  it('renders market style label and explanation entry', () => {
    render(<App />)

    expect(screen.getByText('Market Style')).toBeInTheDocument()
    expect(screen.getByText('Tech-led')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Market Style How is this calculated?' })).toBeInTheDocument()
  })

  it('renders top bar with freshness, delay, market status and connection status', () => {
    render(<App />)

    expect(screen.getByText('US Market Dashboard')).toBeInTheDocument()
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getByText('Data delayed 15 minutes')).toBeInTheDocument()
    expect(screen.getByText('Mock data')).toBeInTheDocument()
    expect(screen.getByText('Mock live')).toBeInTheDocument()
  })

  it('switches dashboard copy between Chinese and English from the top bar', async () => {
    const user = userEvent.setup()
    render(<App />)

    const languageSelect = screen.getByRole('combobox', { name: 'Language' })

    expect(languageSelect).toHaveValue('en')
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
    expect(screen.getByText('Market Pulse')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Market Pulse How is this calculated?' })).toBeInTheDocument()

    await user.selectOptions(languageSelect, 'zh')

    expect(screen.getByRole('combobox', { name: '语言' })).toHaveValue('zh')
    expect(screen.getAllByText('首页').length).toBeGreaterThan(0)
    expect(screen.getByText(/最后更新时间/)).toBeInTheDocument()
    expect(screen.getByText('VIX 风险')).toBeInTheDocument()
    expect(screen.getByText('本页为市场状态摘要，不构成交易建议。')).toBeInTheDocument()
  })

  it('keeps market values stable and does not re-request remote data when language changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const valueBefore = screen.getByText('592.18')
    expect(screen.getByText('+0.72%')).toBeInTheDocument()
    expect(screen.getByText('18.40')).toBeInTheDocument()
    expect(screen.getByText('97')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh')

    expect(valueBefore).toBeInTheDocument()
    expect(screen.getByText('+0.72%')).toBeInTheDocument()
    expect(screen.getByText('18.40')).toBeInTheDocument()
    expect(screen.getByText('97')).toBeInTheDocument()
    expect(getFearGreedData).toHaveBeenCalledTimes(1)
  })

  it('expands metric explanation with inputs and disclaimer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Market Pulse How is this calculated?' }))

    expect(screen.getByText(/Inputs: SPY, QQQ, DIA and VIX/)).toBeInTheDocument()
    expect(screen.getAllByText(/not financial advice/).length).toBeGreaterThan(0)
  })

  it('renders Fear & Greed gauge, score, status and components when API or cache data exists', async () => {
    getFearGreedData.mockResolvedValue({
      score: 68,
      status: { label: '贪婪', color: 'green' },
      components: [
        {
          name: 'VOLATILITY',
          value: 70,
          weight: 25,
          description: 'VIX vs 20-day average',
          raw: 'VIX 18 / MA20 19',
        },
      ],
      updatedAt: '2026-06-03T19:45:00.000Z',
      fromCache: true,
      cacheUpdatedAt: '2026-06-03T19:45:00.000Z',
    })

    render(<App />)

    expect(await screen.findByText('Fear & Greed')).toBeInTheDocument()
    expect(screen.getByText('68')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Fear & Greed')[0]).toHaveTextContent('Greed')
    expect(screen.getByLabelText('Fear & Greed segments')).toHaveTextContent('Extreme Fear')
    expect(screen.getByLabelText('Fear & Greed segments')).toHaveTextContent('Extreme Greed')
    expect(screen.getByText('Volatility')).toBeInTheDocument()
    expect(screen.queryByText('权重 25')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Volatility score 70')).toBeInTheDocument()
    expect(
      screen.getByText('Compares VIX with its recent average to gauge defensive pressure.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('VIX 18 / MA20 19')).not.toBeInTheDocument()
  })

  it('hides Fear & Greed module when API fails and no cache exists', async () => {
    getFearGreedData.mockResolvedValue(null)

    render(<App />)

    await waitFor(() => {
      expect(getFearGreedData).toHaveBeenCalled()
    })
    expect(screen.queryByText('Fear & Greed')).not.toBeInTheDocument()
  })
})
