import { useEffect, useMemo, useState } from 'react'
import { mockDashboardData } from '../data/mockMarketData'
import { createMassiveMarketSocket } from '../services/massiveWebSocket'

export function useMassiveMarketData({ apiKey = import.meta.env.VITE_MASSIVE_API_KEY } = {}) {
  const [indices, setIndices] = useState(mockDashboardData.indices)
  const [vix, setVix] = useState(mockDashboardData.vix)
  const [connectionStatus, setConnectionStatus] = useState('idle')

  useEffect(() => {
    const client = createMassiveMarketSocket({
      apiKey,
      onStatus: setConnectionStatus,
      onUpdate: (update) => {
        setIndices((current) =>
          current.map((index) =>
            index.symbol === update.symbol
              ? {
                  ...index,
                  ...update,
                  closes: [...index.closes.slice(-59), update.price],
                }
              : index,
          ),
        )
      },
    })

    return () => client.close()
  }, [apiKey])

  return useMemo(() => {
    const lastUpdated = indices.reduce(
      (latest, item) => (item.lastUpdated > latest ? item.lastUpdated : latest),
      mockDashboardData.lastUpdated,
    )

    return {
      ...mockDashboardData,
      indices,
      vix,
      setVix,
      lastUpdated,
      connectionStatus,
    }
  }, [connectionStatus, indices, vix])
}
