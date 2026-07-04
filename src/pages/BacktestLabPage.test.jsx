import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BacktestLabPage } from './BacktestLabPage'

const crosshairHandler = vi.hoisted(() => ({ current: null }))
const chartApi = vi.hoisted(() => ({
  setVisibleRange: vi.fn(),
  setVisibleLogicalRange: vi.fn(),
  fitContent: vi.fn(),
  applyOptions: vi.fn(),
}))

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      setData: vi.fn(),
    })),
    applyOptions: chartApi.applyOptions,
    subscribeCrosshairMove: vi.fn((handler) => {
      crosshairHandler.current = handler
    }),
    timeScale: vi.fn(() => ({
      fitContent: chartApi.fitContent,
      setVisibleRange: chartApi.setVisibleRange,
      setVisibleLogicalRange: chartApi.setVisibleLogicalRange,
    })),
    remove: vi.fn(),
  })),
  LineSeries: 'LineSeries',
}))

const backtestResult = {
  alignedRange: { startDate: '2024-01-02', endDate: '2024-01-04', rows: 3 },
  benchmark: {
    summary: { name: 'QQQ Buy & Hold', cagrPct: 9, totalReturnPct: 1, maxDrawdownPct: -1, sharpe: 1.1 },
    equityCurve: [
      { date: '2024-01-02', value: 1 },
      { date: '2024-01-03', value: 1.01 },
      { date: '2024-01-04', value: 1.02 },
    ],
  },
  strategies: [
    {
      id: 'ema15-hist',
      summary: {
        rank: 1,
        name: 'EMA15 + Hist',
        cagrPct: 12,
        totalReturnPct: 1.5,
        maxDrawdownPct: -0.8,
        sharpe: 1.4,
        switches: 1,
        currentHolding: 'QLD',
      },
      equityCurve: [
        { date: '2024-01-02', value: 1 },
        { date: '2024-01-03', value: 1.03 },
        { date: '2024-01-04', value: 1.05 },
      ],
      latestSignal: {
        explanation: 'The strategy remains in QLD.',
        conditions: [{ label: 'Close < EMA15', value: 'false', passed: false }],
      },
      trades: [],
    },
    {
      id: 'slow-tqqq',
      summary: {
        rank: 2,
        name: 'Slow TQQQ',
        cagrPct: 18,
        totalReturnPct: 2.4,
        maxDrawdownPct: -1.4,
        sharpe: 1.2,
        switches: 3,
        currentHolding: 'TQQQ',
      },
      equityCurve: [
        { date: '2024-01-02', value: 1 },
        { date: '2024-01-03', value: 1.02 },
        { date: '2024-01-04', value: 1.06 },
      ],
      latestSignal: {
        explanation: 'The strategy remains in TQQQ.',
        conditions: [{ label: 'Close < EMA15', value: 'false', passed: false }],
      },
      trades: [],
    },
  ],
}

function renderBacktest(language = 'en') {
  return render(
    <MemoryRouter initialEntries={['/backtest']}>
      <Routes>
        <Route element={<Outlet context={{ language }} />}>
          <Route path="/backtest" element={<BacktestLabPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('BacktestLabPage', () => {
  afterEach(() => {
    cleanup()
    chartApi.setVisibleRange.mockClear()
    chartApi.setVisibleLogicalRange.mockClear()
    chartApi.fitContent.mockClear()
    chartApi.applyOptions.mockClear()
    vi.restoreAllMocks()
  })

  it('lets users configure multiple entry and exit rules with AND or OR logic', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => backtestResult,
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderBacktest()

    expect(screen.queryByLabelText('Exit filter: Hist > 0')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Hist > 0')).toBeInTheDocument()

    await user.selectOptions(screen.getAllByLabelText('Condition Logic')[0], 'or')
    await user.click(screen.getAllByRole('button', { name: 'Add Rule' })[0])
    await user.selectOptions(screen.getAllByLabelText('Rule Type')[1], 'price_breakout')
    expect(screen.getByLabelText('Breakout Window')).toHaveValue(20)

    await user.selectOptions(screen.getAllByLabelText('Condition Logic')[1], 'or')
    await user.click(screen.getAllByRole('button', { name: 'Add Rule' })[1])
    await user.selectOptions(screen.getAllByLabelText('Rule Type')[4], 'price_breakdown')
    expect(screen.getByLabelText('Breakdown Window')).toHaveValue(20)

    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.strategies[0].entry.logic).toBe('or')
    expect(request.strategies[0].entry.rules.map((rule) => rule.type)).toEqual(['macd_cross', 'price_breakout'])
    expect(request.strategies[0].exit.logic).toBe('or')
    expect(request.strategies[0].exit.rules.map((rule) => rule.type)).toEqual(['ma_break', 'hist_positive', 'price_breakdown'])
  })

  it('renders Chinese copy when the shell language is Chinese', () => {
    renderBacktest('zh')

    expect(screen.getByRole('heading', { name: '策略回测实验台' })).toBeInTheDocument()
    expect(screen.getByText('实验设置')).toBeInTheDocument()
    expect(screen.getByLabelText('结束日期').value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getAllByLabelText('规则类型')[0]).toHaveDisplayValue('MACD 金叉')
    expect(screen.getByDisplayValue('Hist > 0')).toBeInTheDocument()
    expect(screen.queryByLabelText('退出附加条件：Hist > 0')).not.toBeInTheDocument()
  })

  it('renders equity chart scales and hover values after a backtest run', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => backtestResult,
    })))
    renderBacktest()

    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))

    expect(await screen.findByRole('img', { name: /equity multiple scales/i })).toBeInTheDocument()
    expect(screen.getByText('Equity multiple (initial capital = 1.00x)')).toBeInTheDocument()
    expect(chartApi.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 2 })

    crosshairHandler.current?.({ time: '2024-01-04' })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2024-01-04'))
    expect(screen.getByRole('status')).toHaveTextContent('EMA15 + Hist: Equity multiple 1.05x')
    expect(screen.getByRole('status')).toHaveTextContent('QQQ Buy & Hold: Equity multiple 1.02x')
  })

  it('sorts the result ranking table by any clicked column', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => backtestResult,
    })))
    renderBacktest()

    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))
    expect(await screen.findByRole('cell', { name: 'Slow TQQQ' })).toBeInTheDocument()

    const getResultNames = () => screen.getAllByRole('row')
      .map((row) => row.textContent)
      .filter((text) => text.includes('EMA15 + Hist') || text.includes('Slow TQQQ') || text.includes('QQQ Buy & Hold'))

    expect(getResultNames()[0]).toContain('EMA15 + Hist')

    await user.click(screen.getByRole('button', { name: /CAGR/ }))
    expect(getResultNames()[0]).toContain('Slow TQQQ')

    await user.click(screen.getByRole('button', { name: /CAGR/ }))
    expect(getResultNames()[0]).toContain('QQQ Buy & Hold')

    await user.click(screen.getByRole('button', { name: 'Strategy' }))
    expect(getResultNames()[0]).toContain('EMA15 + Hist')
  })
})
