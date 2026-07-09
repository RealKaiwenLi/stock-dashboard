function todayIsoDate() {
  const today = new Date()
  const timezoneOffsetMs = today.getTimezoneOffset() * 60 * 1000
  return new Date(today.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

export const DEFAULT_BACKTEST_EXPERIMENT = {
  name: 'Custom rotation strategy comparison',
  startDate: '2014-01-01',
  endDate: todayIsoDate(),
  benchmark: 'QQQ',
  strategies: [
    {
      id: 'ema15-hist',
      name: 'EMA15 + Hist',
      signalAsset: 'QQQ',
      riskAsset: 'QLD',
      fallbackAsset: 'QQQ',
      entry: {
        logic: 'and',
        rules: [{ type: 'macd_cross', fast: 12, slow: 26, signal: 9 }],
      },
      exit: {
        logic: 'and',
        rules: [
          { type: 'ma_break', maType: 'ema', window: 15 },
          { type: 'hist_positive', fast: 12, slow: 26, signal: 9 },
        ],
      },
      riskFilter: {
        cape: { enabled: false, max: 30 },
      },
    },
  ],
}

export function createStrategy(index = 1, seed = DEFAULT_BACKTEST_EXPERIMENT.strategies[0]) {
  return {
    ...JSON.parse(JSON.stringify(seed)),
    id: `strategy-${Date.now()}-${index}`,
    name: `Strategy ${index}`,
  }
}

export async function runBacktestExperiment(experiment, { fetcher = fetch } = {}) {
  const response = await fetcher('/api/backtests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(experiment),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Backtest request failed')
  }
  return payload
}
