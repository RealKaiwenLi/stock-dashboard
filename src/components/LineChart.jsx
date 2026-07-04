function buildPoints(values, width, height) {
  if (!values?.length) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : width

  return values
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / spread) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function LineChart({ symbol, closes = [], ariaLabel }) {
  const width = 220
  const height = 72
  const points = buildPoints(closes, width, height)

  return (
    <svg
      className="line-chart"
      role="img"
      aria-label={ariaLabel ?? `${symbol} 盘中走势折线图`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}
