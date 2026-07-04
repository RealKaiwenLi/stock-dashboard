import { Link } from 'react-router-dom'

export function WatchlistCard({ copy, item, quote, onRemove }) {
  const changeClass = quote?.changePercent >= 0 ? 'positive' : 'negative'

  return (
    <article className="watchlist-card" aria-label={`${item.symbol} watchlist card`}>
      <Link to={`/stocks/${item.symbol}`} className="watchlist-card-main">
        <div>
          <p className="eyebrow">{item.name}</p>
          <h2>{item.symbol}</h2>
        </div>
        <div className="quote-row">
          <span>{formatPrice(quote?.price)}</span>
          <span className={changeClass}>{formatPercent(quote?.changePercent)}</span>
        </div>
        <small>{quote?.dataMode === 'mock-live' ? copy.mockLive : copy.unavailable}</small>
      </Link>
      <button type="button" className="icon-button" aria-label={copy.remove(item.symbol)} onClick={() => onRemove(item.symbol)}>
        ×
      </button>
    </article>
  )
}

function formatPrice(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

function formatPercent(value) {
  if (typeof value !== 'number') return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}
