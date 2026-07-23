import { useMemo, useState } from 'react'

const columns = [
  ['rank', 'rank'],
  ['strategy', 'strategy'],
  ['score', 'score'],
  ['riskFlag', 'riskFlag'],
  ['cagrPct', 'cagr'],
  ['excessCagrPct', 'excessCagr'],
  ['maxDrawdownPct', 'maxDrawdown'],
  ['maxDrawdownRatio', 'drawdownRatio'],
  ['sharpe', 'sharpe'],
  ['rolling5yWinRate', 'winRate'],
  ['dcaVsSignalPct', 'dcaLead'],
  ['switchesPerYear', 'switches'],
  ['note', 'note'],
]

const numericColumns = new Set([
  'rank', 'score', 'cagrPct', 'excessCagrPct', 'maxDrawdownPct',
  'maxDrawdownRatio', 'sharpe', 'rolling5yWinRate', 'dcaVsSignalPct', 'switchesPerYear',
])

function formatMetric(key, value) {
  if (value == null) return '-'
  if (key === 'rolling5yWinRate') return `${Number(value).toFixed(1)}%`
  if (['cagrPct', 'excessCagrPct', 'maxDrawdownPct', 'dcaVsSignalPct'].includes(key)) return `${Number(value).toFixed(2)}%`
  if (key === 'rank') return value
  return typeof value === 'number' ? value.toFixed(2) : value
}

export function WeeklyBacktestWidget({ copy, data, error, loading, onRetry }) {
  const items = data?.items ?? []
  const [selectedDate, setSelectedDate] = useState(null)
  const [sort, setSort] = useState({ key: 'rank', direction: 'asc' })
  const selected = items.find((item) => item.reportDate === selectedDate) ?? items[0] ?? null
  const rows = useMemo(() => [...(selected?.summary ?? [])].sort((left, right) => {
    const a = left[sort.key]
    const b = right[sort.key]
    const result = numericColumns.has(sort.key)
      ? (Number(a ?? Number.NEGATIVE_INFINITY) - Number(b ?? Number.NEGATIVE_INFINITY))
      : String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN')
    return sort.direction === 'asc' ? result : -result
  }), [selected, sort])

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <section className="weekly-backtest-section" aria-label={copy.title}>
      <div className="section-heading-row">
        <div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div>
        {data?.lastSyncedAt ? <span className="sync-label">{copy.syncedAt(data.lastSyncedAt)}</span> : null}
      </div>
      {loading && !items.length ? <p>{copy.loading}</p> : null}
      {error && !items.length ? <><p className="module-error">{copy.error}</p><button className="text-button" type="button" onClick={onRetry}>{copy.retry}</button></> : null}
      {!loading && !error && !items.length ? <p className="empty-state">{copy.empty}</p> : null}
      {selected ? (
        <>
          <div className="backtest-week-strip" aria-label={copy.weekSelector}>
            {items.map((item) => (
              <button className={item.reportDate === selected.reportDate ? 'selected' : ''} key={item.reportDate} type="button" onClick={() => setSelectedDate(item.reportDate)}>
                <span>{copy.weekOf}</span><strong>{item.reportDate}</strong>
              </button>
            ))}
          </div>
          <div className="weekly-backtest-meta">
            <div><span>{copy.report}</span><strong>{selected.title ?? '-'}</strong></div>
            <div><span>{copy.latestBar}</span><strong>{selected.latestBarDate ?? '-'}</strong></div>
            <div><span>{copy.assets}</span><strong>{[selected.signalSymbol, selected.riskSymbol].filter(Boolean).join(' / ') || '-'}</strong></div>
            <div><span>{copy.generatedAt}</span><strong>{selected.generatedAt ?? '-'}</strong></div>
          </div>
          <div className="table-scroll">
            <table className="backtest-table weekly-backtest-table">
              <thead><tr>{columns.map(([key, label]) => <th key={key}><button className="table-sort-button" type="button" onClick={() => changeSort(key)}>{copy.columns[label]} {sort.key === key ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</button></th>)}</tr></thead>
              <tbody>{rows.map((row) => <tr key={`${selected.reportDate}-${row.rank}-${row.strategy}`}>{columns.map(([key]) => <td className={key === 'note' ? 'weekly-note-cell' : undefined} key={key}>{formatMetric(key, row[key])}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {selected.notionUrl ? <a className="weekly-notion-link" href={selected.notionUrl} target="_blank" rel="noreferrer">{copy.openNotion}</a> : null}
        </>
      ) : null}
    </section>
  )
}
