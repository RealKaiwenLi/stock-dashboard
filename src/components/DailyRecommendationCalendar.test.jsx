import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyRecommendationCalendar } from './DailyRecommendationCalendar'
import { getDashboardCopy } from '../i18n/dashboardCopy'

const copy = getDashboardCopy('en').dailyRecommendations
const data = {
  items: [
    {
      date: '2026-07-02',
      recommendedHolding: 'QLD',
      action: 'HOLD',
      holdForNextOpen: 'QLD',
      latestBarDate: '2026-07-01',
      modelVersion: '1.0.0',
      macd: 1.2,
      hist: 0.3,
      exitEmaLabel: 'EMA15',
      exitEma: 540.22,
      fullExitSignal: false,
      notionUrl: 'https://notion.so/day-one',
    },
    {
      date: '2026-07-04',
      recommendedHolding: 'TQQQ',
      action: 'SWITCH_TO_TQQQ',
      holdForNextOpen: 'TQQQ',
      latestBarDate: '2026-07-02',
      modelVersion: '1.0.1',
      macd: 2.1,
      hist: 0.6,
      exitEmaLabel: 'EMA12',
      exitEma: 555.44,
      fullExitSignal: false,
      notionUrl: 'https://notion.so/day-two',
    },
  ],
  lastSyncedAt: '2026-07-04T09:00:00-07:00',
}

function renderCalendar(overrides = {}) {
  return render(
    <DailyRecommendationCalendar
      copy={copy}
      data={data}
      language="en"
      monthDate={new Date(2026, 6, 1)}
      onMonthChange={vi.fn()}
      onRetry={vi.fn()}
      onSelectDate={vi.fn()}
      selectedDate={null}
      {...overrides}
    />,
  )
}

describe('DailyRecommendationCalendar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders latest recommendation and position calendar tiles', () => {
    renderCalendar()

    expect(screen.getByText('Daily Recommendation')).toBeInTheDocument()
    expect(screen.getByLabelText('Latest recommendation')).toHaveTextContent('TQQQ')
    expect(screen.getByRole('button', { name: '2026-07-02 recommends QLD, action HOLD' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-04 recommends TQQQ, action SWITCH_TO_TQQQ' })).toBeInTheDocument()
    expect(screen.getByText('EMA12')).toBeInTheDocument()
    expect(screen.getByText('1.0.1')).toBeInTheDocument()
  })

  it('selects a calendar day and shows that day detail', async () => {
    const user = userEvent.setup()
    const onSelectDate = vi.fn()
    const { rerender } = renderCalendar({ onSelectDate })

    await user.click(screen.getByRole('button', { name: '2026-07-02 recommends QLD, action HOLD' }))

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-02')

    rerender(
      <DailyRecommendationCalendar
        copy={copy}
        data={data}
        language="en"
        monthDate={new Date(2026, 6, 1)}
        onMonthChange={vi.fn()}
        onRetry={vi.fn()}
        onSelectDate={onSelectDate}
        selectedDate="2026-07-02"
      />,
    )

    expect(screen.getByLabelText('Recommendation detail')).toHaveTextContent('QLD')
    expect(screen.getByText('EMA15')).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
  })

  it('renders loading, empty and error states', () => {
    const { rerender } = renderCalendar({ data: { items: [] }, loading: true })
    expect(screen.getByText('Loading Notion recommendations...')).toBeInTheDocument()

    rerender(
      <DailyRecommendationCalendar
        copy={copy}
        data={{ items: [] }}
        language="en"
        monthDate={new Date(2026, 6, 1)}
        onMonthChange={vi.fn()}
        onRetry={vi.fn()}
        onSelectDate={vi.fn()}
        selectedDate={null}
      />,
    )
    expect(screen.getAllByText('No daily recommendations for this month.').length).toBeGreaterThan(0)

    rerender(
      <DailyRecommendationCalendar
        copy={copy}
        data={{ items: [] }}
        error={new Error('failed')}
        language="en"
        monthDate={new Date(2026, 6, 1)}
        onMonthChange={vi.fn()}
        onRetry={vi.fn()}
        onSelectDate={vi.fn()}
        selectedDate={null}
      />,
    )
    expect(screen.getByText('Daily recommendations are unavailable. Market data is still available.')).toBeInTheDocument()
  })
})
