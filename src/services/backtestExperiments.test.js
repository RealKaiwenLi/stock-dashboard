import { describe, expect, it, vi } from 'vitest'
import {
  BACKTEST_EXPERIMENTS_STORAGE_KEY,
  deleteBacktestExperiment,
  loadBacktestExperiment,
  readBacktestExperiments,
  saveBacktestExperiment,
} from './backtestExperiments'

const storage = () => {
  const data = new Map()
  return { getItem: vi.fn((key) => data.get(key) || null), setItem: vi.fn((key, value) => data.set(key, value)) }
}

describe('backtest experiments', () => {
  it('round trips declarative post-exit config and does not restore runtime', () => {
    const target = storage()
    const saved = saveBacktestExperiment({
      name: 'x', startDate: '2020-01-01', endDate: '2024-01-01', benchmark: 'SPY',
      strategies: [{ id: 'old', name: 's', postExitReentry: { enabled: true, cooldownTradingDays: 3, signalHandling: 'ignore' }, events: [{}] }],
    }, { runtime: true }, target)
    const loaded = loadBacktestExperiment(saved.id, target)
    expect(loaded.strategies[0].id).not.toBe('old')
    expect(loaded.strategies[0].postExitReentry.cooldownTradingDays).toBe(3)
    expect(loaded.strategies[0].events).toBeUndefined()
    expect(loaded.resultSummary).toBeNull()
    expect(target.setItem).toHaveBeenCalledWith(BACKTEST_EXPERIMENTS_STORAGE_KEY, expect.any(String))
  })

  it('deletes only the selected saved experiment', () => {
    const target = storage()
    const first = saveBacktestExperiment({ name: 'First', strategies: [] }, null, target)
    const second = saveBacktestExperiment({ name: 'Second', strategies: [] }, null, target)

    const remaining = deleteBacktestExperiment(first.id, target)

    expect(remaining.map((item) => item.id)).toEqual([second.id])
    expect(readBacktestExperiments(target).map((item) => item.name)).toEqual(['Second'])
  })
})
