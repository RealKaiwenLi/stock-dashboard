import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { INDICATOR_PREFERENCES_KEY } from '../services/indicatorPreferences'
import { StockDetailPage } from './StockDetailPage'

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: vi.fn(),
      createPriceLine: vi.fn(),
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    })),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange: vi.fn(),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    })),
    remove: vi.fn(),
  })),
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
}))

function renderDetail(path = '/stocks/AAPL') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stocks/:ticker" element={<StockDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StockDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders quote header, controls, chart and disclaimer', async () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: 'AAPL' })).toBeInTheDocument()
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    expect(await screen.findByText('214.18')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('技术指标')).toHaveTextContent('MACD')
    expect(screen.getByText('均线')).toBeInTheDocument()
    expect(screen.getByLabelText('VWAP')).not.toBeChecked()
    expect(screen.getByLabelText('Bollinger Bands')).not.toBeChecked()
    expect(screen.getByLabelText('MACD')).toBeChecked()
    expect(screen.getByLabelText('KDJ')).not.toBeChecked()
    expect(screen.getByLabelText('MA20')).not.toBeChecked()
    expect(screen.getByLabelText('MA50')).not.toBeChecked()
    expect(screen.getByLabelText('MA100')).not.toBeChecked()
    expect(await screen.findByTestId('stock-chart')).toBeInTheDocument()
    expect(await screen.findByTestId('macd-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('kdj-chart')).not.toBeInTheDocument()
    expect(await screen.findByText('行情摘要')).toBeInTheDocument()
    expect(screen.getByText('昨收')).toBeInTheDocument()
    expect(screen.getByText('买价')).toBeInTheDocument()
    expect(screen.getByText('52 周区间')).toBeInTheDocument()
    expect(screen.getByText('预期股息与收益率')).toBeInTheDocument()
    expect(screen.queryByText('Earnings Date')).not.toBeInTheDocument()
    expect(screen.queryByText('1y Target Est')).not.toBeInTheDocument()
    expect(screen.getByText('技术指标仅供研究，不构成投资建议。')).toBeInTheDocument()
  })

  it('switches ranges and toggles indicators', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.click(screen.getByRole('button', { name: '1Y' }))
    expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByLabelText('VWAP'))
    expect(screen.getByLabelText('VWAP')).toBeChecked()
    expect(screen.getByLabelText('主图指标图例')).toHaveTextContent('VWAP')

    await user.click(screen.getByLabelText('MA100'))
    expect(screen.getByLabelText('MA100')).toBeChecked()
    expect(screen.getByText('MA100', { selector: '.indicator-summary span' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(INDICATOR_PREFERENCES_KEY))).toEqual(
      expect.objectContaining({
        vwap: true,
        movingAverages: expect.objectContaining({ ma100: true }),
      }),
    )
  })

  it('reuses saved indicator choices across stock detail pages', async () => {
    const user = userEvent.setup()
    renderDetail('/stocks/AAPL')

    await user.click(screen.getByLabelText('VWAP'))
    await user.click(screen.getByLabelText('KDJ'))

    cleanup()
    renderDetail('/stocks/NVDA')

    expect(screen.getByRole('heading', { name: 'NVDA' })).toBeInTheDocument()
    expect(screen.getByLabelText('VWAP')).toBeChecked()
    expect(screen.getByLabelText('KDJ')).toBeChecked()
  })

  it('shows not found state for invalid tickers', () => {
    renderDetail('/stocks/NOPE')

    expect(screen.getByRole('heading', { name: '未找到该股票' })).toBeInTheDocument()
    expect(screen.getByText('NOPE')).toBeInTheDocument()
  })
})
