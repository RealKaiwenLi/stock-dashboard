import { normalizeStrategyConfig } from './backtestStrategyConfig'

export const BACKTEST_EXPERIMENTS_STORAGE_KEY = 'stock-dashboard.backtestExperiments.v1'
const MAX_STRATEGIES = 5

const clone = (value) => JSON.parse(JSON.stringify(value))

function readEnvelope(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(BACKTEST_EXPERIMENTS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function readBacktestExperiments(storage = globalThis.localStorage) {
  return readEnvelope(storage).flatMap((item) => {
    try {
      if (item.version !== 1) return []
      return [{ ...item, strategies: item.strategies.map(normalizeStrategyConfig) }]
    } catch {
      return []
    }
  })
}

export function saveBacktestExperiment(experiment, resultSummary = null, storage = globalThis.localStorage) {
  const current = readBacktestExperiments(storage)
  const now = new Date().toISOString()
  const id = experiment.id || `experiment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const existing = current.find((item) => item.id === id)
  const saved = {
    version: 1,
    id,
    name: String(experiment.name || 'Backtest experiment'),
    startDate: experiment.startDate,
    endDate: experiment.endDate,
    benchmark: experiment.benchmark,
    strategies: (experiment.strategies || []).slice(0, MAX_STRATEGIES).map(normalizeStrategyConfig),
    resultSummary: resultSummary ? clone(resultSummary) : null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  const next = [saved, ...current.filter((item) => item.id !== id)]
  storage?.setItem(BACKTEST_EXPERIMENTS_STORAGE_KEY, JSON.stringify(next))
  return saved
}

export function loadBacktestExperiment(id, storage = globalThis.localStorage) {
  const saved = readBacktestExperiments(storage).find((item) => item.id === id)
  if (!saved) return null
  return {
    ...clone(saved),
    strategies: saved.strategies.map((strategy, index) => ({
      ...normalizeStrategyConfig(strategy),
      id: `strategy-${Date.now()}-${index + 1}`,
    })),
    resultSummary: null,
  }
}

export function deleteBacktestExperiment(id, storage = globalThis.localStorage) {
  if (!id) return readBacktestExperiments(storage)
  const next = readBacktestExperiments(storage).filter((item) => item.id !== id)
  storage?.setItem(BACKTEST_EXPERIMENTS_STORAGE_KEY, JSON.stringify(next))
  return next
}
