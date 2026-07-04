import { useOutletContext } from 'react-router-dom'
import { StockSearch } from '../components/StockSearch'
import { WatchlistCard } from '../components/WatchlistCard'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { useWatchlist } from '../hooks/useWatchlist'
import { getStockCopy } from '../i18n/stockCopy'

export function WatchlistPage() {
  const outletContext = useOutletContext()
  const copy = getStockCopy(outletContext?.language).watchlist
  const watchlist = useWatchlist()
  const { quotesBySymbol, connectionStatus } = useStockQuotes(watchlist.symbols)

  return (
    <main className="dashboard-shell page-shell">
      <header className="page-header">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
      </header>
      <StockSearch copy={copy} watchlistSymbols={watchlist.symbols} onAdd={watchlist.addItem} />
      <section aria-label={copy.savedRegion}>
        <div className="section-heading">
          <h2>{copy.sectionTitle}</h2>
          <span className="status-pill">{connectionStatus === 'mock-live' ? copy.mockLive : connectionStatus}</span>
        </div>
        {watchlist.items.length ? (
          <div className="watchlist-grid">
            {watchlist.items.map((item) => (
              <WatchlistCard copy={copy} item={item} quote={quotesBySymbol[item.symbol]} onRemove={watchlist.removeItem} key={item.symbol} />
            ))}
          </div>
        ) : (
          <section className="dashboard-card empty-state">
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyDescription}</p>
          </section>
        )}
      </section>
    </main>
  )
}
