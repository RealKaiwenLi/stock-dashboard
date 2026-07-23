import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { WeeklyBacktestWidget } from './WeeklyBacktestWidget'

const copy = { eyebrow: 'Weekly', title: 'Weekly Backtests', syncedAt: String, loading: 'Loading', error: 'Error', retry: 'Retry', empty: 'Empty', weekSelector: 'Weeks', weekOf: 'Week', report: 'Report', latestBar: 'Latest bar', assets: 'Assets', generatedAt: 'Generated', openNotion: 'Open Notion', columns: { rank: 'Rank', strategy: 'Strategy', score: 'Score', riskFlag: 'Risk flag', cagr: 'CAGR', excessCagr: 'Excess CAGR', maxDrawdown: 'Max drawdown', drawdownRatio: 'Drawdown/QQQ', sharpe: 'Sharpe', winRate1y: '1Y win rate', winRate3y: '3Y win rate', winRate5y: '5Y win rate', dcaLead: 'DCA lead vs QQQ', switches: 'Switches/year', note: 'Note' } }
const data = { items: [{ reportDate: '2026-07-17', title: 'Test', summary: [{ rank: 1, strategy: 'Alpha', score: 80, riskFlag: 'HIGH_DD', excessCagrPct: 12.34, maxDrawdownRatio: 1.2, rolling1yWinRate: 71.2, rolling3yWinRate: 84.6, rolling5yWinRate: 95.1, dcaVsSignalPct: 42.5, note: 'Alpha note' }, { rank: 2, strategy: 'Beta', score: 90 }] }] }

describe('WeeklyBacktestWidget', () => {
  afterEach(cleanup)

  it('sorts a result column in both directions', async () => {
    const user = userEvent.setup()
    render(<WeeklyBacktestWidget copy={copy} data={data} />)
    await user.click(screen.getByRole('button', { name: 'Score' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Alpha')
    await user.click(screen.getByRole('button', { name: /Score/ }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Beta')
  })

  it('shows every column returned by the Notion ranking database', () => {
    render(<WeeklyBacktestWidget copy={copy} data={data} />)
    expect(screen.getByRole('button', { name: 'Risk flag' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excess CAGR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drawdown/QQQ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1Y win rate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3Y win rate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5Y win rate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DCA lead vs QQQ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
    expect(screen.getByText('HIGH_DD')).toBeInTheDocument()
    expect(screen.getByText('12.34%')).toBeInTheDocument()
    expect(screen.getByText('71.2%')).toBeInTheDocument()
    expect(screen.getByText('84.6%')).toBeInTheDocument()
    expect(screen.getByText('95.1%')).toBeInTheDocument()
    expect(screen.getByText('Alpha note')).toBeInTheDocument()
  })
})
