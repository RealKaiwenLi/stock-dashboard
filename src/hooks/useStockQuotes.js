import { useEffect, useMemo, useState } from 'react'
import { createMockQuoteStream, getStockQuotes } from '../services/stockQuoteService'

export function useStockQuotes(symbols, { quoteService = getStockQuotes, streamFactory = createMockQuoteStream } = {}) {
  const symbolsKey = symbols.map((symbol) => String(symbol).toUpperCase()).sort().join('|')
  const stableSymbols = useMemo(() => (symbolsKey ? symbolsKey.split('|') : []), [symbolsKey])
  const [quotesBySymbol, setQuotesBySymbol] = useState({})
  const [connectionStatus, setConnectionStatus] = useState(stableSymbols.length ? 'connecting' : 'idle')

  useEffect(() => {
    let active = true
    if (!stableSymbols.length) {
      return undefined
    }

    quoteService(stableSymbols).then((quotes) => {
      if (!active) return
      setQuotesBySymbol(quotes)
      setConnectionStatus('mock-live')
    })

    const stream = streamFactory({
      symbols: stableSymbols,
      onUpdate: (quote) => {
        if (!active) return
        setQuotesBySymbol((current) => ({ ...current, [quote.symbol]: quote }))
        setConnectionStatus('mock-live')
      },
    })

    return () => {
      active = false
      stream?.close()
    }
  }, [quoteService, stableSymbols, streamFactory])

  const lastUpdated = Object.values(quotesBySymbol)
    .map((quote) => quote.lastUpdated)
    .filter(Boolean)
    .sort()
    .at(-1)

  if (!stableSymbols.length) {
    return { quotesBySymbol: {}, connectionStatus: 'idle', dataMode: 'idle', lastUpdated: undefined }
  }

  return { quotesBySymbol, connectionStatus, dataMode: connectionStatus, lastUpdated }
}
