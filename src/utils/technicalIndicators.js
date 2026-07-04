export function calculateSMA(values, period) {
  return values.map((_, index) => {
    if (index < period - 1) return null
    const window = values.slice(index - period + 1, index + 1)
    return average(window)
  })
}

export function calculateEMA(values, period) {
  if (values.length < period) return []
  const multiplier = 2 / (period + 1)
  const result = Array(values.length).fill(null)
  let previous = average(values.slice(0, period))
  result[period - 1] = previous

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous
    result[index] = previous
  }

  return result
}

export function calculateStandardDeviation(values) {
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

export function calculateMACD(closes, { fast = 12, slow = 26, signal = 9 } = {}) {
  if (closes.length < slow + signal) return []
  const fastEma = calculateEMA(closes, fast)
  const slowEma = calculateEMA(closes, slow)
  const macdLine = closes.map((_, index) => {
    if (fastEma[index] == null || slowEma[index] == null) return null
    return fastEma[index] - slowEma[index]
  })
  const compactMacd = macdLine.filter((value) => value != null)
  const signalCompact = calculateEMA(compactMacd, signal)
  let signalIndex = 0

  return macdLine.map((macd) => {
    if (macd == null) return null
    const signalValue = signalCompact[signalIndex]
    signalIndex += 1
    if (signalValue == null) return null
    return roundIndicator({ macd, signal: signalValue, histogram: macd - signalValue })
  })
}

export function calculateBollingerBands(closes, { period = 20, standardDeviations = 2 } = {}) {
  if (closes.length < period) return []
  return closes.map((_, index) => {
    if (index < period - 1) return null
    const window = closes.slice(index - period + 1, index + 1)
    const middle = average(window)
    const deviation = calculateStandardDeviation(window)
    return roundIndicator({
      middle,
      upper: middle + standardDeviations * deviation,
      lower: middle - standardDeviations * deviation,
    })
  })
}

export function calculateMovingAverage(closes, period) {
  if (closes.length < period) return []
  return calculateSMA(closes, period).map((value) => (value == null ? null : { value: Number(value.toFixed(4)) }))
}

export function calculateKDJ(bars, { period = 9, kSmoothing = 3, dSmoothing = 3 } = {}) {
  if (bars.length < period) return []
  let previousK = 50
  let previousD = 50

  return bars.map((bar, index) => {
    if (index < period - 1) return null
    const window = bars.slice(index - period + 1, index + 1)
    const highestHigh = Math.max(...window.map((item) => item.high))
    const lowestLow = Math.min(...window.map((item) => item.low))
    const range = highestHigh - lowestLow
    const rsv = range === 0 ? 50 : ((bar.close - lowestLow) / range) * 100
    const k = (previousK * (kSmoothing - 1) + rsv) / kSmoothing
    const d = (previousD * (dSmoothing - 1) + k) / dSmoothing
    const j = 3 * k - 2 * d
    previousK = k
    previousD = d
    return roundIndicator({ k, d, j })
  })
}

export function calculateVWAP(bars) {
  let cumulativeTypicalVolume = 0
  let cumulativeVolume = 0

  return bars.map((bar) => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3
    cumulativeTypicalVolume += typicalPrice * bar.volume
    cumulativeVolume += bar.volume
    return { vwap: Number((cumulativeTypicalVolume / cumulativeVolume).toFixed(4)) }
  })
}

export function alignIndicatorToBars(bars, indicatorValues) {
  return bars
    .map((bar, index) => (indicatorValues[index] ? { time: bar.time, ...indicatorValues[index] } : null))
    .filter(Boolean)
}

export function buildIndicatorsForBars(bars) {
  const closes = bars.map((bar) => bar.close)
  return {
    macd: alignIndicatorToBars(bars, calculateMACD(closes)),
    kdj: alignIndicatorToBars(bars, calculateKDJ(bars)),
    bollinger: alignIndicatorToBars(bars, calculateBollingerBands(closes)),
    vwap: alignIndicatorToBars(bars, calculateVWAP(bars)),
    movingAverages: {
      ma20: alignIndicatorToBars(bars, calculateMovingAverage(closes, 20)),
      ma50: alignIndicatorToBars(bars, calculateMovingAverage(closes, 50)),
      ma100: alignIndicatorToBars(bars, calculateMovingAverage(closes, 100)),
      ma200: alignIndicatorToBars(bars, calculateMovingAverage(closes, 200)),
    },
  }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundIndicator(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value.toFixed(4))]))
}
