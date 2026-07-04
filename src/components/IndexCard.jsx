import { LineChart } from './LineChart'

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatSigned(value, suffix = '') {
  const sign = value > 0 ? '+' : ''
  return `${sign}${numberFormatter.format(value)}${suffix}`
}

export function IndexCard({ index, copy, name }) {
  const indexName = name ?? index.nameZh

  return (
    <article className="dashboard-card index-card" aria-label={`${index.symbol} ${indexName}`}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{indexName}</p>
          <h2>{index.symbol}</h2>
        </div>
        <span className={index.changePercent >= 0 ? 'status-pill positive' : 'status-pill negative'}>
          {formatSigned(index.changePercent, '%')}
        </span>
      </div>

      <dl className="quote-grid">
        <div>
          <dt>{copy.labels.currentPrice}</dt>
          <dd>{numberFormatter.format(index.price)}</dd>
        </div>
        <div>
          <dt>{copy.labels.dailyChange}</dt>
          <dd>{formatSigned(index.change)}</dd>
        </div>
        <div>
          <dt>{copy.labels.fiveDay}</dt>
          <dd>{formatSigned(index.returns.fiveDay, '%')}</dd>
        </div>
        <div>
          <dt>{copy.labels.oneMonth}</dt>
          <dd>{formatSigned(index.returns.oneMonth, '%')}</dd>
        </div>
      </dl>

      <LineChart symbol={index.symbol} closes={index.closes} ariaLabel={copy.chart.intradayLine(index.symbol)} />
    </article>
  )
}
