import { getFearGreedStatus } from '../utils/marketMetrics'

export const FEAR_GREED_API_URL = 'https://feargreedchart.com/api/?action=all'

function normalizeTimestamp(ts) {
  if (!ts) return new Date().toISOString()
  const milliseconds = ts < 10_000_000_000 ? ts * 1000 : ts
  return new Date(milliseconds).toISOString()
}

export function normalizeFearGreedResponse(response) {
  const score = Number(response?.score?.score)

  return {
    score,
    status: getFearGreedStatus(score),
    components: (response?.score?.components ?? []).map((component) => ({
      name: component.name,
      value: component.val,
      weight: component.wt,
      description: component.desc,
      raw: component.raw,
    })),
    vix: {
      value: response?.market?.['^VIX']?.price ?? response?.market?.['^VIX']?.value,
    },
    updatedAt: normalizeTimestamp(response?.ts),
  }
}

export async function fetchFearGreedData({ fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(FEAR_GREED_API_URL)
  if (!response.ok) {
    throw new Error(`FearGreedChart API failed: ${response.status}`)
  }

  return normalizeFearGreedResponse(await response.json())
}
