import { useEffect, useMemo, useState } from 'react'
import { FearGreedCard } from '../components/FearGreedCard'
import { GaugeCard } from '../components/GaugeCard'
import { IndexCard } from '../components/IndexCard'
import { MarketStyleCard } from '../components/MarketStyleCard'
import { DailyRecommendationCalendar } from '../components/DailyRecommendationCalendar'
import { useMassiveMarketData } from '../hooks/useMassiveMarketData'
import {
  getComponentCopy,
  getIndexName,
  getLocalizedStatusLabel,
} from '../i18n/dashboardCopy'
import { getFearGreedData } from '../services/fearGreedService'
import {
  fetchDailyRecommendations,
  getRollingMonthRange,
  mergeDailyRecommendationData,
  rangeIncludesMonth,
} from '../services/dailyRecommendationsApi'
import {
  calculateMarketPulse,
  calculateMarketStyle,
  getMarketPulseStatus,
  getVixRiskLevel,
} from '../utils/marketMetrics'
import { useOutletContext } from 'react-router-dom'

function getBySymbol(indices, symbol) {
  return indices.find((index) => index.symbol === symbol)
}

const segmentSourceLabels = [
  '平静',
  '正常',
  '警惕',
  '紧张',
  '恐慌',
  '偏弱',
  '中性',
  '偏强',
  '极度恐惧',
  '恐惧',
  '贪婪',
  '极度贪婪',
]

function buildSegmentLabelMap(language) {
  return Object.fromEntries(segmentSourceLabels.map((label) => [label, getLocalizedStatusLabel(label, language)]))
}

export function DashboardHome() {
  const marketData = useMassiveMarketData()
  const [fearGreedData, setFearGreedData] = useState(null)
  const [recommendations, setRecommendations] = useState({ items: [] })
  const [recommendationsStatus, setRecommendationsStatus] = useState('loading')
  const [recommendationsError, setRecommendationsError] = useState(null)
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedRecommendationDate, setSelectedRecommendationDate] = useState(null)
  const [cachedRecommendationRange, setCachedRecommendationRange] = useState(null)
  const [requestedRecommendationRange, setRequestedRecommendationRange] = useState(() => getRollingMonthRange(new Date()))
  const [recommendationsReloadKey, setRecommendationsReloadKey] = useState(0)
  const { language, copy } = useOutletContext()
  const segmentLabelMap = useMemo(() => buildSegmentLabelMap(language), [language])

  useEffect(() => {
    let active = true

    getFearGreedData().then((data) => {
      if (active) {
        setFearGreedData(data)
      }
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    fetchDailyRecommendations(requestedRecommendationRange)
      .then((data) => {
        if (!active) return
        setRecommendations((current) => mergeDailyRecommendationData(current, data))
        setCachedRecommendationRange((current) => {
          if (!current) return requestedRecommendationRange
          return {
            from: current.from < requestedRecommendationRange.from ? current.from : requestedRecommendationRange.from,
            to: current.to > requestedRecommendationRange.to ? current.to : requestedRecommendationRange.to,
          }
        })
        setRecommendationsStatus('complete')
        setSelectedRecommendationDate((current) => current ?? data.items.at(-1)?.date ?? null)
      })
      .catch((error) => {
        if (!active) return
        setRecommendationsError(error)
        setRecommendationsStatus('error')
      })

    return () => {
      active = false
    }
  }, [requestedRecommendationRange, recommendationsReloadKey])

  function handleRecommendationMonthChange(delta) {
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1)
    setSelectedRecommendationDate(null)
    setMonthDate(nextMonth)
    if (!rangeIncludesMonth(cachedRecommendationRange, nextMonth)) {
      setRecommendationsStatus('loading')
      setRecommendationsError(null)
      setRequestedRecommendationRange(getRollingMonthRange(nextMonth))
    }
  }

  const derived = useMemo(() => {
    const vixValue = marketData.vix.value ?? marketData.vix.price
    const vixRisk = getVixRiskLevel(vixValue)
    const pulseScore = calculateMarketPulse({
      indices: marketData.indices,
      vix: marketData.vix,
    })
    const pulseStatus = getMarketPulseStatus(pulseScore)
    const marketStyle = calculateMarketStyle({
      spy: getBySymbol(marketData.indices, 'SPY'),
      qqq: getBySymbol(marketData.indices, 'QQQ'),
      dia: getBySymbol(marketData.indices, 'DIA'),
    })

    return { vixValue, vixRisk, pulseScore, pulseStatus, marketStyle }
  }, [marketData.indices, marketData.vix])

  return (
    <main className="dashboard-shell">
      <section className="summary-grid" aria-label={copy.regions.summary}>
        <GaugeCard
          title={copy.modules.marketPulse}
          value={derived.pulseScore}
          status={getLocalizedStatusLabel(derived.pulseStatus.label, language)}
          tone={derived.pulseStatus.color}
          variant="pulseSegments"
          explanationTrigger={copy.explanationTrigger}
          segmentLabelMap={segmentLabelMap}
          segmentAriaLabel={copy.labels.segmentedLabel(copy.modules.marketPulse)}
          explanation={copy.explanations.marketPulse.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        />
        <GaugeCard
          title={copy.modules.vixRisk}
          value={derived.vixValue.toFixed(2)}
          max={50}
          status={getLocalizedStatusLabel(derived.vixRisk.label, language)}
          tone={derived.vixRisk.color}
          variant="segments"
          explanationTrigger={copy.explanationTrigger}
          segmentLabelMap={segmentLabelMap}
          segmentAriaLabel={copy.labels.segmentedLabel(copy.modules.vixRisk)}
          explanation={copy.explanations.vixRisk.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        />
        <MarketStyleCard
          title={copy.modules.marketStyle}
          styleLabel={getLocalizedStatusLabel(derived.marketStyle.label, language)}
          description={copy.descriptions.marketStyle}
          explanationTrigger={copy.explanationTrigger}
          explanation={copy.explanations.marketStyle}
        />
      </section>

      {fearGreedData ? (
        <FearGreedCard
          data={fearGreedData}
          title={copy.modules.fearGreed}
          statusLabel={getLocalizedStatusLabel(fearGreedData.status.label, language)}
          copy={copy}
          explanation={copy.explanations.fearGreed}
          explanationTrigger={copy.explanationTrigger}
          segmentLabelMap={segmentLabelMap}
          getComponentCopy={(component) => getComponentCopy(component, language)}
        />
      ) : null}

      <DailyRecommendationCalendar
        copy={copy.dailyRecommendations}
        data={recommendations}
        error={recommendationsError}
        language={language}
        loading={recommendationsStatus === 'loading'}
        monthDate={monthDate}
        onMonthChange={handleRecommendationMonthChange}
        onRetry={() => {
          setRecommendationsStatus('loading')
          setRecommendationsError(null)
          setCachedRecommendationRange(null)
          setRecommendationsReloadKey((current) => current + 1)
        }}
        onSelectDate={setSelectedRecommendationDate}
        selectedDate={selectedRecommendationDate}
      />

      <section className="index-grid" aria-label={copy.regions.indices}>
        {marketData.indices.map((index) => (
          <IndexCard index={index} key={index.symbol} copy={copy} name={getIndexName(index, language)} />
        ))}
      </section>

      <footer className="dashboard-footer">{copy.disclaimer}</footer>
    </main>
  )
}
