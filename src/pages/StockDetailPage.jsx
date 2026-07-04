import { Link, useOutletContext, useParams } from 'react-router-dom'
import { IndicatorToggleGroup } from '../components/IndicatorToggleGroup'
import { QuoteSummary } from '../components/QuoteSummary'
import { RangeControl } from '../components/RangeControl'
import { StockChart } from '../components/StockChart'
import { StockPriceHeader } from '../components/StockPriceHeader'
import { mockStockDirectory } from '../data/mockStocks'
import { useEffect, useMemo, useState } from 'react'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { getStockCopy } from '../i18n/stockCopy'
import { readIndicatorPreferences, writeIndicatorPreferences } from '../services/indicatorPreferences'
import { getStockBars } from '../services/stockBarsService'
import { getStockSummary } from '../services/stockSummaryService'
import { buildIndicatorsForBars } from '../utils/technicalIndicators'

export function StockDetailPage() {
  const outletContext = useOutletContext()
  const stockCopy = getStockCopy(outletContext?.language)
  const detailCopy = stockCopy.detail
  const { ticker = '' } = useParams()
  const symbol = ticker.toUpperCase()
  const stock = mockStockDirectory.find((item) => item.ticker === symbol)
  const [range, setRange] = useState('6M')
  const [bars, setBars] = useState([])
  const [quoteSummary, setQuoteSummary] = useState(null)
  const [enabledIndicators, setEnabledIndicators] = useState(() => readIndicatorPreferences())
  const { quotesBySymbol } = useStockQuotes(stock ? [symbol] : [])

  useEffect(() => {
    let active = true
    if (!stock) return undefined
    getStockBars(symbol, range).then((result) => {
      if (active) setBars(result.bars)
    })
    return () => {
      active = false
    }
  }, [range, stock, symbol])

  useEffect(() => {
    let active = true
    if (!stock) return undefined
    getStockSummary(symbol).then((result) => {
      if (active) setQuoteSummary(result.summary)
    })
    return () => {
      active = false
    }
  }, [stock, symbol])

  const indicators = useMemo(() => buildIndicatorsForBars(bars), [bars])

  if (!stock) {
    return (
      <main className="dashboard-shell page-shell">
        <Link to="/watchlist">{stockCopy.backToWatchlist}</Link>
        <section className="dashboard-card empty-state">
          <h1>{detailCopy.notFound}</h1>
          <p>{symbol}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-shell page-shell">
      <Link to="/watchlist">{stockCopy.backToWatchlist}</Link>
      <StockPriceHeader stock={stock} quote={quotesBySymbol[symbol]} />
      <div className="stock-toolbar">
        <RangeControl copy={detailCopy} value={range} onChange={setRange} />
        <IndicatorToggleGroup
          copy={detailCopy}
          enabledIndicators={enabledIndicators}
          onToggle={(key) =>
            setEnabledIndicators((current) => {
              let next
              if (Array.isArray(key)) {
                const [, maKey] = key
                next = {
                  ...current,
                  movingAverages: { ...current.movingAverages, [maKey]: !current.movingAverages[maKey] },
                }
              } else {
                next = { ...current, [key]: !current[key] }
              }
              return writeIndicatorPreferences(next)
            })
          }
        />
      </div>
      <StockChart copy={detailCopy} bars={bars} indicators={indicators} enabledIndicators={enabledIndicators} />
      <QuoteSummary copy={detailCopy} summary={quoteSummary} />
      <footer className="dashboard-footer">{detailCopy.disclaimer}</footer>
    </main>
  )
}
