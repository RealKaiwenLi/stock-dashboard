import { useEffect, useState } from 'react'
import { searchStocks } from '../services/stockSearchService'
import { StockSearchResults } from './StockSearchResults'

export function StockSearch({ copy, watchlistSymbols, onAdd }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    let active = true
    const trimmed = query.trim()
    if (!trimmed) {
      return undefined
    }

    searchStocks(trimmed).then((nextResults) => {
      if (!active) return
      setResults(nextResults)
      setStatus(nextResults.length ? 'ready' : 'empty')
    })

    return () => {
      active = false
    }
  }, [query])

  return (
    <section className="dashboard-card stock-search" aria-label={copy.searchLabel}>
      <label htmlFor="stock-search-input">{copy.searchLabel}</label>
      <input
        id="stock-search-input"
        type="search"
        value={query}
        placeholder={copy.searchPlaceholder}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          if (!nextQuery.trim()) {
            setResults([])
            setStatus('idle')
          } else {
            setStatus('loading')
          }
        }}
      />
      {status === 'loading' ? <p className="helper-text">{copy.loading}</p> : null}
      {status === 'empty' ? <p className="helper-text">{copy.emptySearch}</p> : null}
      <StockSearchResults copy={copy} results={results} watchlistSymbols={watchlistSymbols} onAdd={onAdd} />
    </section>
  )
}
