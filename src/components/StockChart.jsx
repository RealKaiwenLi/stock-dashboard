import { useEffect, useRef } from 'react'
import { CandlestickSeries, createChart, HistogramSeries, LineSeries } from 'lightweight-charts'

const CHART_COLORS = {
  bollingerUpperLower: '#9B8BD9',
  bollingerMiddle: '#6EA8D9',
  vwap: '#D6B65E',
  ma20: '#89B86F',
  ma50: '#C9A25D',
  ma100: '#7EA7C6',
  ma200: '#C4869A',
  macd: '#6EA8D9',
  macdSignal: '#F0A35E',
  macdGrowAbove: '#7BC9B5',
  macdFallAbove: '#C8E7DE',
  macdGrowBelow: '#F3C6C3',
  macdFallBelow: '#E98B84',
  kdjK: '#6EA8D9',
  kdjD: '#F0A35E',
  kdjJ: '#B894D6',
  kdjOverboughtFill: 'rgba(233, 139, 132, 0.12)',
  kdjOversoldFill: 'rgba(123, 201, 181, 0.12)',
  kdjThreshold: 'rgba(215, 224, 234, 0.42)',
}

const KDJ_THRESHOLDS = {
  overbought: 80,
  oversold: 20,
}

export function StockChart({ copy, bars, indicators, enabledIndicators }) {
  const containerRef = useRef(null)
  const macdRef = useRef(null)
  const kdjRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !bars.length) return undefined

    const charts = []
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 900,
      height: 420,
      layout: { background: { color: 'transparent' }, textColor: '#d7e0ea' },
      grid: { vertLines: { color: 'rgba(148,163,184,0.12)' }, horzLines: { color: 'rgba(148,163,184,0.12)' } },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.24)' },
      timeScale: { borderColor: 'rgba(148,163,184,0.24)' },
    })
    charts.push(chart)

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#21a67a',
      downColor: '#e05252',
      borderVisible: false,
      wickUpColor: '#21a67a',
      wickDownColor: '#e05252',
    })
    candleSeries.setData(bars)

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: 'rgba(72, 164, 201, 0.35)',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    volumeSeries.setData(bars.map((bar) => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? 'rgba(33,166,122,0.35)' : 'rgba(224,82,82,0.35)' })))

    if (enabledIndicators.bollinger && indicators.bollinger.length) {
      addLine(chart, indicators.bollinger.map((item) => ({ time: item.time, value: item.upper })), CHART_COLORS.bollingerUpperLower)
      addLine(chart, indicators.bollinger.map((item) => ({ time: item.time, value: item.middle })), CHART_COLORS.bollingerMiddle)
      addLine(chart, indicators.bollinger.map((item) => ({ time: item.time, value: item.lower })), CHART_COLORS.bollingerUpperLower)
    }

    if (enabledIndicators.vwap && indicators.vwap.length) {
      addLine(chart, indicators.vwap.map((item) => ({ time: item.time, value: item.vwap })), CHART_COLORS.vwap, 2)
    }

    Object.entries(enabledIndicators.movingAverages).forEach(([key, isEnabled]) => {
      const data = indicators.movingAverages[key] ?? []
      if (isEnabled && data.length) {
        addLine(chart, data.map((item) => ({ time: item.time, value: item.value })), CHART_COLORS[key], 1)
      }
    })

    if (enabledIndicators.macd && macdRef.current && indicators.macd.length) {
      const macdChart = createIndicatorChart(macdRef.current, 190)
      charts.push(macdChart)
      const histogram = macdChart.addSeries(HistogramSeries, { color: 'rgba(72,164,201,0.5)' })
      histogram.setData(
        indicators.macd.map((item, index, values) => ({
          time: item.time,
          value: item.histogram,
          color: getMacdHistogramColor(item.histogram, values[index - 1]?.histogram),
        })),
      )
      addLine(macdChart, indicators.macd.map((item) => ({ time: item.time, value: item.macd })), CHART_COLORS.macd)
      addLine(macdChart, indicators.macd.map((item) => ({ time: item.time, value: item.signal })), CHART_COLORS.macdSignal)
      macdChart.timeScale().fitContent()
    }

    if (enabledIndicators.kdj && kdjRef.current && indicators.kdj.length) {
      const kdjChart = createIndicatorChart(kdjRef.current, 170)
      charts.push(kdjChart)
      const kLine = addLine(kdjChart, indicators.kdj.map((item) => ({ time: item.time, value: item.k })), CHART_COLORS.kdjK)
      addLine(kdjChart, indicators.kdj.map((item) => ({ time: item.time, value: item.d })), CHART_COLORS.kdjD)
      addLine(kdjChart, indicators.kdj.map((item) => ({ time: item.time, value: item.j })), CHART_COLORS.kdjJ)
      addKdjThresholdLine(kLine, KDJ_THRESHOLDS.overbought)
      addKdjThresholdLine(kLine, KDJ_THRESHOLDS.oversold)
      kdjChart.timeScale().fitContent()
    }

    const unsubscribeSync = syncChartTimeScales(charts)
    chart.timeScale().fitContent()
    return () => {
      unsubscribeSync()
      charts.forEach((item) => item.remove())
    }
  }, [
    bars,
    enabledIndicators.bollinger,
    enabledIndicators.kdj,
    enabledIndicators.macd,
    enabledIndicators.vwap,
    enabledIndicators.movingAverages,
    indicators.bollinger,
    indicators.kdj,
    indicators.macd,
    indicators.vwap,
    indicators.movingAverages,
  ])

  if (!bars.length) {
    return <div className="dashboard-card empty-state">{copy.noChartData}</div>
  }

  return (
    <section className="stock-chart-section" aria-label={copy.chartLabel}>
      <div className="main-chart-frame">
        <ChartOverlayLegend copy={copy} enabledIndicators={enabledIndicators} />
        <div ref={containerRef} className="stock-chart" data-testid="stock-chart" />
      </div>
      {enabledIndicators.macd ? (
        <div>
          <h2 className="indicator-chart-title">MACD</h2>
          <div ref={macdRef} className="stock-chart indicator-chart" data-testid="macd-chart" />
        </div>
      ) : null}
      {enabledIndicators.kdj ? (
        <div>
          <h2 className="indicator-chart-title">KDJ</h2>
          <div className="kdj-chart-frame">
            <div className="kdj-zone kdj-zone-overbought" aria-label={copy.kdjOverboughtZone} />
            <div className="kdj-zone kdj-zone-oversold" aria-label={copy.kdjOversoldZone} />
            <div ref={kdjRef} className="stock-chart indicator-chart" data-testid="kdj-chart" />
          </div>
        </div>
      ) : null}
      <div className="indicator-summary">
        {enabledIndicators.bollinger ? (
          <span>
            <i style={{ backgroundColor: CHART_COLORS.bollingerUpperLower }} />Bollinger Bands
          </span>
        ) : null}
        {enabledIndicators.vwap ? (
          <span>
            <i style={{ backgroundColor: CHART_COLORS.vwap }} />VWAP
          </span>
        ) : null}
        {Object.entries(enabledIndicators.movingAverages).map(([key, isEnabled]) =>
          isEnabled ? (
            <span key={key}>
              <i style={{ backgroundColor: CHART_COLORS[key] }} />
              {key.toUpperCase()}
            </span>
          ) : null,
        )}
        {enabledIndicators.macd ? (
          <IndicatorReadout
            label="MACD"
            copy={copy}
            items={indicators.macd}
            fields={['macd', 'signal', 'histogram']}
            swatches={{ macd: CHART_COLORS.macd, signal: CHART_COLORS.macdSignal, histogram: CHART_COLORS.macdGrowAbove }}
          />
        ) : null}
        {enabledIndicators.kdj ? (
          <IndicatorReadout
            label="KDJ"
            copy={copy}
            items={indicators.kdj}
            fields={['k', 'd', 'j']}
            swatches={{ k: CHART_COLORS.kdjK, d: CHART_COLORS.kdjD, j: CHART_COLORS.kdjJ }}
          />
        ) : null}
      </div>
    </section>
  )
}

function ChartOverlayLegend({ copy, enabledIndicators }) {
  const items = []

  if (enabledIndicators.bollinger) {
    items.push(['Bollinger', CHART_COLORS.bollingerUpperLower])
  }
  if (enabledIndicators.vwap) {
    items.push(['VWAP', CHART_COLORS.vwap])
  }
  Object.entries(enabledIndicators.movingAverages).forEach(([key, isEnabled]) => {
    if (isEnabled) items.push([key.toUpperCase(), CHART_COLORS[key]])
  })

  if (!items.length) return null

  return (
    <div className="chart-overlay-legend" aria-label={copy.mainLegend}>
      {items.map(([label, color]) => (
        <span key={label}>
          <i style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}

function getMacdHistogramColor(value, previousValue = 0) {
  if (value >= 0) {
    return value >= previousValue ? CHART_COLORS.macdGrowAbove : CHART_COLORS.macdFallAbove
  }
  return value >= previousValue ? CHART_COLORS.macdGrowBelow : CHART_COLORS.macdFallBelow
}

function createIndicatorChart(container, height) {
  return createChart(container, {
    width: container.clientWidth || 900,
    height,
    layout: { background: { color: 'transparent' }, textColor: '#d7e0ea' },
    grid: { vertLines: { color: 'rgba(148,163,184,0.1)' }, horzLines: { color: 'rgba(148,163,184,0.1)' } },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.24)' },
    timeScale: { borderColor: 'rgba(148,163,184,0.24)' },
  })
}

function syncChartTimeScales(charts) {
  let isSyncing = false
  const handlers = charts.map((sourceChart) => {
    const handler = (range) => {
      if (!range || isSyncing) return
      isSyncing = true
      charts.forEach((targetChart) => {
        if (targetChart !== sourceChart) {
          targetChart.timeScale().setVisibleLogicalRange(range)
        }
      })
      isSyncing = false
    }
    sourceChart.timeScale().subscribeVisibleLogicalRangeChange(handler)
    return { chart: sourceChart, handler }
  })

  return () => {
    handlers.forEach(({ chart, handler }) => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler)
    })
  }
}

function addLine(chart, data, color, lineWidth = 1) {
  const line = chart.addSeries(LineSeries, { color, lineWidth })
  line.setData(data)
  return line
}

function addKdjThresholdLine(series, price) {
  series.createPriceLine({
    price,
    color: CHART_COLORS.kdjThreshold,
    lineStyle: 2,
    lineWidth: 1,
    axisLabelVisible: true,
  })
}

function IndicatorReadout({ copy, label, items, fields, swatches = {} }) {
  const latest = items.at(-1)
  if (!latest) return <span>{copy.insufficientIndicator(label)}</span>
  return (
    <span>
      {label}:{' '}
      {fields.map((field, index) => (
        <b key={field}>
          {index > 0 ? ' / ' : ''}
          <i style={{ backgroundColor: swatches[field] }} />
          {field.toUpperCase()} {latest[field].toFixed(2)}
        </b>
      ))}
    </span>
  )
}
