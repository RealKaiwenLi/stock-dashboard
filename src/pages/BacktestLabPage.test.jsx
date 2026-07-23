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
    localStorage.clear()
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

  it('adds an optional CAPE risk filter to the backtest payload', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => backtestResult,
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderBacktest()

    expect(screen.getByLabelText('Enable CAPE filter')).not.toBeChecked()
    expect(screen.getByLabelText('Maximum CAPE')).toBeDisabled()

    await user.click(screen.getByLabelText('Enable CAPE filter'))
    await user.clear(screen.getByLabelText('Maximum CAPE'))
    await user.type(screen.getByLabelText('Maximum CAPE'), '30')
    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.strategies[0].riskFilter).toEqual({
      cape: { enabled: true, max: 30 },
    })
  })

  it('configures a generic post-exit re-entry policy and blocks invalid active fields', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => backtestResult }))
    vi.stubGlobal('fetch', fetchMock)
    renderBacktest()

    expect(screen.getByText('Post-exit re-entry: off')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Enable post-exit re-entry restrictions'))
    const cooldownInput = screen.getByLabelText('Cooldown trading days')
    await user.clear(cooldownInput)
    await user.type(cooldownInput, '0')
    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))
    expect(await screen.findByText('Enter an integer from 1–252 trading days')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.clear(cooldownInput)
    await user.type(cooldownInput, '3')
    await user.selectOptions(screen.getByLabelText('Signals during cooldown'), 'retain_latest')
    await user.selectOptions(screen.getByLabelText('Release validation'), 'signal_still_valid')
    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.strategies[0].postExitReentry).toMatchObject({
      enabled: true,
      cooldownTradingDays: 3,
      signalHandling: 'retain_latest',
      releaseValidation: { mode: 'signal_still_valid' },
    })
  })

  it('keeps valid candidates running and renders an invalid candidate error row', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => backtestResult }))
    vi.stubGlobal('fetch', fetchMock)
    renderBacktest()
    await user.click(screen.getByRole('button', { name: 'Add Strategy' }))
    const toggles = screen.getAllByLabelText('Enable post-exit re-entry restrictions')
    await user.click(toggles[1])
    const cooldowns = screen.getAllByLabelText('Cooldown trading days')
    await user.clear(cooldowns[0])
    await user.type(cooldowns[0], '0')
    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.strategies).toHaveLength(1)
    expect(await screen.findByRole('cell', { name: 'Strategy 2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /1–252/ })).toBeInTheDocument()
  })

  it('places the policy after exit rules and exposes MACD release parameters with row errors', async () => {
    const user = userEvent.setup()
    renderBacktest()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(headings.indexOf('Post-exit Re-entry Policy')).toBeGreaterThan(headings.indexOf('Exit Rule'))
    expect(headings.indexOf('Post-exit Re-entry Policy')).toBeLessThan(headings.indexOf('Risk Filter'))
    await user.click(screen.getByLabelText('Enable post-exit re-entry restrictions'))
    await user.selectOptions(screen.getByLabelText('Signals during cooldown'), 'retain_latest')
    await user.selectOptions(screen.getByLabelText('Release validation'), 'rule_group')
    const releaseFast = screen.getAllByLabelText('MACD Fast').at(-1)
    expect(releaseFast).toHaveValue('12')
    await user.clear(releaseFast)
    await user.type(releaseFast, '0')
    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))
    expect(await screen.findByText('Enter an integer from 1–252 trading days')).toBeInTheDocument()
  })

  it('renders Chinese copy when the shell language is Chinese', () => {
    renderBacktest('zh')

    expect(screen.getByRole('heading', { name: '策略回测实验台' })).toBeInTheDocument()
    expect(screen.getByText('实验设置')).toBeInTheDocument()
    expect(screen.getByLabelText('结束日期').value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getAllByLabelText('规则类型')[0]).toHaveDisplayValue('MACD 金叉')
    expect(screen.getByDisplayValue('Hist > 0')).toBeInTheDocument()
    expect(screen.queryByLabelText('退出附加条件：Hist > 0')).not.toBeInTheDocument()
    expect(screen.getByText('退出后再入场限制：关闭')).toBeInTheDocument()
  })

  it('makes the five-day retained-signal setting discoverable in Chinese', async () => {
    const user = userEvent.setup()
    renderBacktest('zh')

    await user.click(screen.getByLabelText('启用退出后再入场限制'))
    expect(screen.getByText(/选择“暂存最新信号”/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('冷却期间入场信号'), 'retain_latest')

    expect(screen.getByLabelText('新入场信号保留交易日数')).toHaveValue('5')
    expect(screen.getByText(/5 天 = 信号日 \+ 后续 4 个有效交易日/)).toBeInTheDocument()
    expect(screen.getByText(/冷却期间暂存最新入场信号，并保留 5 个交易日/)).toBeInTheDocument()
  })

  it('saves a strategy as a local favorite and adds it back with one click', async () => {
    const user = userEvent.setup()
    renderBacktest()

    await user.clear(screen.getByLabelText('Strategy Name'))
    await user.type(screen.getByLabelText('Strategy Name'), 'TQQQ Favorite')
    await user.clear(screen.getByLabelText('Risk'))
    await user.type(screen.getByLabelText('Risk'), 'tqqq')

    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveTextContent('☆')
    await user.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveTextContent('★')

    expect(screen.getByRole('region', { name: 'Strategy Favorites' })).toHaveTextContent('TQQQ Favorite')
    expect(screen.getByRole('region', { name: 'Strategy Favorites' })).toHaveTextContent('Risk TQQQ')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getAllByDisplayValue('TQQQ Favorite')).toHaveLength(2)
    expect(screen.getAllByDisplayValue('TQQQ')).toHaveLength(2)
  })

  it('collapses strategy cards without changing the backtest payload', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => backtestResult,
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderBacktest()

    await user.click(screen.getByRole('button', { name: 'Collapse' }))

    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Strategy Name')).not.toBeInTheDocument()
    expect(screen.getByText('EMA15 + Hist')).toBeInTheDocument()
    expect(screen.getByText('Signal QQQ / Risk QLD / Fallback QQQ')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run Backtest' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.strategies[0].name).toBe('EMA15 + Hist')
    expect(request.strategies[0].exit.rules.map((rule) => rule.type)).toEqual(['ma_break', 'hist_positive'])

    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByLabelText('Strategy Name')).toHaveValue('EMA15 + Hist')
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
