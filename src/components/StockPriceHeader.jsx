export function StockPriceHeader({ stock, quote }) {
  const changeClass = quote?.changePercent >= 0 ? 'positive' : 'negative'

  return (
    <header className="stock-price-header">
      <div>
        <p className="eyebrow">{stock.name}</p>
        <h1>{stock.ticker}</h1>
      </div>
      <div className="stock-price-values">
        <span className="stock-price">{formatPrice(quote?.price)}</span>
        <span className={changeClass}>
          {formatChange(quote?.change)} {formatPercent(quote?.changePercent)}
        </span>
        <small>{quote?.dataMode === 'mock-live' ? '模拟实时' : '数据不可用'}</small>
      </div>
    </header>
  )
}

function formatPrice(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

function formatChange(value) {
  if (typeof value !== 'number') return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function formatPercent(value) {
  if (typeof value !== 'number') return '(--)'
  return `(${value >= 0 ? '+' : ''}${value.toFixed(2)}%)`
}
