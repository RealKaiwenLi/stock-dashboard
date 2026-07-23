import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DailyRecommendationCalendar } from '../components/DailyRecommendationCalendar'
import { WeeklyBacktestWidget } from '../components/WeeklyBacktestWidget'
import {
  fetchDailyRecommendations,
  getRollingMonthRange,
  mergeDailyRecommendationData,
  rangeIncludesMonth,
} from '../services/dailyRecommendationsApi'
import { fetchWeeklyBacktests } from '../services/weeklyBacktestsApi'

export function DashboardHome() {
  const [recommendations, setRecommendations] = useState({ items: [] })
  const [recommendationsStatus, setRecommendationsStatus] = useState('loading')
  const [recommendationsError, setRecommendationsError] = useState(null)
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedRecommendationDate, setSelectedRecommendationDate] = useState(null)
  const [cachedRecommendationRange, setCachedRecommendationRange] = useState(null)
  const [requestedRecommendationRange, setRequestedRecommendationRange] = useState(() => getRollingMonthRange(new Date()))
  const [recommendationsReloadKey, setRecommendationsReloadKey] = useState(0)
  const [weeklyBacktests, setWeeklyBacktests] = useState({ items: [] })
  const [weeklyStatus, setWeeklyStatus] = useState('loading')
  const [weeklyError, setWeeklyError] = useState(null)
  const [weeklyReloadKey, setWeeklyReloadKey] = useState(0)
  const { language, copy } = useOutletContext()

  useEffect(() => {
    let active = true
    fetchDailyRecommendations(requestedRecommendationRange)
      .then((data) => {
        if (!active) return
        setRecommendations((current) => mergeDailyRecommendationData(current, data))
        setCachedRecommendationRange((current) => current ? {
          from: current.from < requestedRecommendationRange.from ? current.from : requestedRecommendationRange.from,
          to: current.to > requestedRecommendationRange.to ? current.to : requestedRecommendationRange.to,
        } : requestedRecommendationRange)
        setRecommendationsStatus('complete')
        setSelectedRecommendationDate((current) => current ?? data.items.at(-1)?.date ?? null)
      })
      .catch((error) => { if (active) { setRecommendationsError(error); setRecommendationsStatus('error') } })
    return () => { active = false }
  }, [requestedRecommendationRange, recommendationsReloadKey])

  useEffect(() => {
    let active = true
    fetchWeeklyBacktests()
      .then((data) => { if (active) { setWeeklyBacktests(data); setWeeklyStatus('complete') } })
      .catch((error) => { if (active) { setWeeklyError(error); setWeeklyStatus('error') } })
    return () => { active = false }
  }, [weeklyReloadKey])

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

  return (
    <main className="dashboard-shell strategy-home">
      <DailyRecommendationCalendar
        copy={copy.dailyRecommendations} data={recommendations} error={recommendationsError}
        language={language} loading={recommendationsStatus === 'loading'} monthDate={monthDate}
        onMonthChange={handleRecommendationMonthChange}
        onRetry={() => { setRecommendationsStatus('loading'); setRecommendationsError(null); setCachedRecommendationRange(null); setRecommendationsReloadKey((value) => value + 1) }}
        onSelectDate={setSelectedRecommendationDate} selectedDate={selectedRecommendationDate}
      />
      <WeeklyBacktestWidget
        copy={copy.weeklyBacktests} data={weeklyBacktests} error={weeklyError} loading={weeklyStatus === 'loading'}
        onRetry={() => { setWeeklyStatus('loading'); setWeeklyError(null); setWeeklyReloadKey((value) => value + 1) }}
      />
    </main>
  )
}
