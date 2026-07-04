import { Link } from 'react-router-dom'

export function StockSearchResults({ copy, results, watchlistSymbols, onAdd }) {
  if (!results.length) return null

  return (
    <ul className="search-results" aria-label={copy.searchLabel}>
      {results.map((stock) => {
        const isAdded = watchlistSymbols.includes(stock.ticker)
        return (
          <li key={stock.ticker}>
            <Link to={`/stocks/${stock.ticker}`} className="search-result-main">
              <strong>{stock.ticker}</strong>
              <span>{stock.name}</span>
              <small>{stock.primaryExchange || stock.market}</small>
            </Link>
            <button
              type="button"
              disabled={isAdded}
              onClick={() =>
                onAdd({
                  symbol: stock.ticker,
                  name: stock.name,
                  primaryExchange: stock.primaryExchange,
                  type: stock.type,
                })
              }
            >
              {isAdded ? copy.added : copy.add}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
