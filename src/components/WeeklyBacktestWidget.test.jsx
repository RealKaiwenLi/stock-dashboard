import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WeeklyBacktestWidget } from './WeeklyBacktestWidget'

const copy = { eyebrow: 'Weekly', title: 'Weekly Backtests', syncedAt: String, loading: 'Loading', error: 'Error', retry: 'Retry', empty: 'Empty', weekSelector: 'Weeks', weekOf: 'Week', report: 'Report', latestBar: 'Latest bar', assets: 'Assets', generatedAt: 'Generated', openNotion: 'Open Notion', columns: { rank: 'Rank', strategy: 'Strategy', score: 'Score', cagr: 'CAGR', maxDrawdown: 'Max drawdown', sharpe: 'Sharpe', winRate: '5Y win rate', switches: 'Switches/year' } }
const data = { items: [{ reportDate: '2026-07-17', title: 'Test', summary: [{ rank: 1, strategy: 'Alpha', score: 80 }, { rank: 2, strategy: 'Beta', score: 90 }] }] }

describe('WeeklyBacktestWidget', () => {
  it('sorts a result column in both directions', async () => {
    const user = userEvent.setup()
    render(<WeeklyBacktestWidget copy={copy} data={data} />)
    await user.click(screen.getByRole('button', { name: 'Score' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Alpha')
    await user.click(screen.getByRole('button', { name: /Score/ }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Beta')
  })
})
