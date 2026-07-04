export function getVixRiskLevel(value) {
  if (value < 15) {
    return { label: '平静', color: 'green', score: 100 }
  }
  if (value < 20) {
    return { label: '正常', color: 'lime', score: 80 }
  }
  if (value < 30) {
    return { label: '警惕', color: 'yellow', score: 50 }
  }
  if (value < 40) {
    return { label: '紧张', color: 'orange', score: 20 }
  }
  return { label: '恐慌', color: 'red', score: 0 }
}

function calculateTrendScore(index) {
  const price = Number(index?.price ?? 0)
  const twentyDay = Number(index?.movingAverages?.twentyDay ?? Infinity)
  const fiftyDay = Number(index?.movingAverages?.fiftyDay ?? Infinity)
  let score = 0

  if (Number(index?.changePercent ?? 0) > 0) score += 25
  if (Number(index?.returns?.fiveDay ?? 0) > 0) score += 25
  if (price > twentyDay) score += 25
  if (price > fiftyDay) score += 25

  return score
}

export function calculateMarketPulse({ indices, vix }) {
  const bySymbol = Object.fromEntries(indices.map((index) => [index.symbol, index]))
  const vixValue = Number(vix?.value ?? vix?.price ?? 0)
  const weightedScore =
    calculateTrendScore(bySymbol.SPY) * 0.4 +
    calculateTrendScore(bySymbol.QQQ) * 0.25 +
    calculateTrendScore(bySymbol.DIA) * 0.2 +
    getVixRiskLevel(vixValue).score * 0.15

  return Math.round(weightedScore)
}

export function getMarketPulseStatus(score) {
  if (score <= 30) {
    return { label: '偏弱', color: 'red' }
  }
  if (score <= 60) {
    return { label: '中性', color: 'yellow' }
  }
  return { label: '偏强', color: 'green' }
}

function leadershipScore(index) {
  return (
    Number(index?.changePercent ?? 0) * 0.5 +
    Number(index?.returns?.fiveDay ?? 0) * 0.3 +
    Number(index?.returns?.oneMonth ?? 0) * 0.2
  )
}

export function calculateMarketStyle({ spy, qqq, dia }) {
  const entries = [
    ['SPY', leadershipScore(spy)],
    ['QQQ', leadershipScore(qqq)],
    ['DIA', leadershipScore(dia)],
  ]
  const allWeak = [spy, qqq, dia].every(
    (index) => Number(index?.changePercent ?? 0) < 0 && Number(index?.returns?.fiveDay ?? 0) < 0,
  )

  if (allWeak) {
    return { label: '整体偏弱', scores: Object.fromEntries(entries) }
  }

  const scores = Object.fromEntries(entries)
  const values = entries.map(([, score]) => score)
  const spread = Math.max(...values) - Math.min(...values)

  if (spread <= 0.5) {
    return { label: '走势均衡', scores }
  }
  if (scores.QQQ === Math.max(...values) && scores.QQQ - scores.SPY > 0.5) {
    return { label: '科技股领涨', scores }
  }
  if (scores.DIA === Math.max(...values) && scores.DIA - scores.SPY > 0.5) {
    return { label: '蓝筹股领涨', scores }
  }
  return { label: '走势均衡', scores }
}

export function getFearGreedStatus(score) {
  if (score <= 20) {
    return { label: '极度恐惧', color: 'red' }
  }
  if (score <= 40) {
    return { label: '恐惧', color: 'orange' }
  }
  if (score <= 60) {
    return { label: '中性', color: 'yellow' }
  }
  if (score <= 80) {
    return { label: '贪婪', color: 'green' }
  }
  return { label: '极度贪婪', color: 'darkGreen' }
}
