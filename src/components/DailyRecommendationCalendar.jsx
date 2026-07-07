import { buildCalendarDays } from '../services/dailyRecommendationsApi'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const HOLDING_CLASS = {
  QQQ: 'holding-qqq',
  QLD: 'holding-qld',
  TQQQ: 'holding-tqqq',
  CASH: 'holding-cash',
}

function monthLabel(monthDate, language) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
  }).format(monthDate)
}

function byDate(items) {
  return Object.fromEntries(items.map((item) => [item.date, item]))
}

function latestItem(items) {
  return [...items].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null
}

function formatValue(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return value ?? '-'
}

export function DailyRecommendationCalendar({
  copy,
  data,
  error,
  language = 'en',
  loading = false,
  monthDate,
  onMonthChange,
  onRetry,
  onSelectDate,
  selectedDate,
}) {
  const items = data?.items ?? []
  const itemMap = byDate(items)
  const latest = latestItem(items)
  const selected = itemMap[selectedDate] ?? latest
  const calendarDays = buildCalendarDays(monthDate)

  if (loading && !items.length) {
    return (
      <section className="position-calendar-section" aria-label={copy.title}>
        <div className="section-heading-row">
          <h2>{copy.title}</h2>
          <span>{copy.loading}</span>
        </div>
      </section>
    )
  }

  if (error && !items.length) {
    return (
      <section className="position-calendar-section" aria-label={copy.title}>
        <div className="section-heading-row">
          <h2>{copy.title}</h2>
          <button className="text-button" type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
        <p className="module-error">{copy.error}</p>
      </section>
    )
  }

  return (
    <section className="position-calendar-section" aria-label={copy.title}>
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
        </div>
        <span className="sync-label">{data?.lastSyncedAt ? copy.syncedAt(data.lastSyncedAt) : copy.source}</span>
      </div>
      {error ? <p className="module-error">{copy.error}</p> : null}

      {latest ? (
        <div className="position-summary" aria-label={copy.latestTitle}>
          <div>
            <span>{copy.latestTitle}</span>
            <strong>{latest.recommendedHolding}</strong>
          </div>
          <div>
            <span>{copy.reportDate}</span>
            <strong>{latest.date}</strong>
          </div>
          <div>
            <span>{copy.action}</span>
            <strong>{latest.action ?? 'HOLD'}</strong>
          </div>
        </div>
      ) : (
        <p className="empty-state">{copy.empty}</p>
      )}

      <div className="position-calendar-layout">
        <div className="position-calendar">
          <div className="calendar-toolbar">
            <button type="button" aria-label={copy.previousMonth} onClick={() => onMonthChange(-1)}>
              ‹
            </button>
            <strong>{monthLabel(monthDate, language)}</strong>
            <button type="button" aria-label={copy.nextMonth} onClick={() => onMonthChange(1)}>
              ›
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="position-grid">
            {calendarDays.map((day) => {
              if (day.empty) return <span className="position-day empty" key={day.key} />
              const item = itemMap[day.date]
              const holding = item?.recommendedHolding
              const isSwitch = item?.action && item.action !== 'HOLD'
              const tone = HOLDING_CLASS[holding] ?? 'holding-other'
              return (
                <button
                  className={`position-day ${holding ? tone : ''} ${selected?.date === day.date ? 'selected' : ''} ${isSwitch ? 'switch-day' : ''}`}
                  disabled={!item}
                  key={day.key}
                  onClick={() => onSelectDate(day.date)}
                  type="button"
                  aria-label={item ? copy.dayLabel(day.date, holding, item.action ?? 'HOLD') : day.date}
                >
                  <span>{day.day}</span>
                  {holding ? <strong>{holding}</strong> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="position-detail" aria-label={copy.detailTitle}>
          {selected ? (
            <>
              <div className="detail-heading">
                <span>{selected.date}</span>
                <strong>{selected.recommendedHolding}</strong>
              </div>
              <dl>
                <div>
                  <dt>{copy.holdForNextOpen}</dt>
                  <dd>{selected.holdForNextOpen ?? selected.recommendedHolding}</dd>
                </div>
                <div>
                  <dt>{copy.latestBarDate}</dt>
                  <dd>{selected.latestBarDate ?? '-'}</dd>
                </div>
                <div>
                  <dt>{copy.modelVersion}</dt>
                  <dd>{selected.modelVersion ?? '-'}</dd>
                </div>
                <div>
                  <dt>MACD</dt>
                  <dd>{formatValue(selected.macd)}</dd>
                </div>
                <div>
                  <dt>Hist</dt>
                  <dd>{formatValue(selected.hist)}</dd>
                </div>
                <div>
                  <dt>{selected.exitEmaLabel ?? 'EMA'}</dt>
                  <dd>{formatValue(selected.exitEma)}</dd>
                </div>
                <div>
                  <dt>{copy.fullExitSignal}</dt>
                  <dd>{formatValue(selected.fullExitSignal)}</dd>
                </div>
              </dl>
              {selected.explanation ? <p>{selected.explanation}</p> : null}
              {selected.notionUrl ? (
                <a href={selected.notionUrl} target="_blank" rel="noreferrer">
                  {copy.openNotion}
                </a>
              ) : (
                <button type="button" disabled>
                  {copy.openNotion}
                </button>
              )}
            </>
          ) : (
            <p className="empty-state">{copy.empty}</p>
          )}
        </div>
      </div>
    </section>
  )
}
