import { useCallback, useMemo, useState } from 'react'
import { addWatchlistItem, readWatchlist, removeWatchlistItem } from '../services/watchlistStorage'

export function useWatchlist({ storage = globalThis.localStorage } = {}) {
  const [items, setItems] = useState(() => readWatchlist(storage))

  const addItem = useCallback(
    (item) => {
      const nextItems = addWatchlistItem(item, storage)
      setItems(nextItems)
      return nextItems
    },
    [storage],
  )

  const removeItem = useCallback(
    (symbol) => {
      const nextItems = removeWatchlistItem(symbol, storage)
      setItems(nextItems)
      return nextItems
    },
    [storage],
  )

  const symbols = useMemo(() => items.map((item) => item.symbol), [items])

  return { items, symbols, addItem, removeItem }
}
