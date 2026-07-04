const summaryRows = [
  ['previousClose', formatPrice],
  ['open', formatPrice],
  ['bid', formatBidAsk('bid', 'bidSize')],
  ['ask', formatBidAsk('ask', 'askSize')],
  ['dayRange', formatRange],
  ['week52Range', formatRange],
  ['volume', formatInteger],
  ['averageVolume', formatInteger],
  ['marketCap', formatCompact],
  ['beta', formatNumber],
  ['peRatio', formatNumber],
  ['eps', formatNumber],
  ['forwardDividend', formatDividend],
  ['exDividendDate', formatDate],
]

export function QuoteSummary({ copy, summary }) {
  if (!summary) return null

  return (
    <section className="quote-summary dashboard-card" aria-label={copy.quoteSummary}>
      <h2>{copy.quoteSummary}</h2>
      <dl>
        {summaryRows.map(([key, formatter]) => (
          <div key={key}>
            <dt>{copy.summaryRows[key]}</dt>
            <dd>{formatter(summary[key], summary)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function formatPrice(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

function formatInteger(value) {
  return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : '--'
}

function formatCompact(value) {
  if (typeof value !== 'number') return '--'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 3 }).format(value)
}

function formatRange(value) {
  if (!value || typeof value.low !== 'number' || typeof value.high !== 'number') return '--'
  return `${value.low.toFixed(2)} - ${value.high.toFixed(2)}`
}

function formatBidAsk(priceKey, sizeKey) {
  return (_, summary) => {
    const price = summary[priceKey]
    const size = summary[sizeKey]
    if (typeof price !== 'number' || typeof size !== 'number') return '--'
    return `${price.toFixed(2)} x ${formatInteger(size)}`
  }
}

function formatDividend(value, summary) {
  if (typeof value !== 'number' || typeof summary.dividendYield !== 'number') return '--'
  return `${value.toFixed(2)} (${summary.dividendYield.toFixed(2)}%)`
}

function formatDate(value) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}
