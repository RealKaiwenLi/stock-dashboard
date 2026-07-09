import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createChart, LineSeries } from 'lightweight-charts'
import { createStrategy, DEFAULT_BACKTEST_EXPERIMENT, runBacktestExperiment } from '../services/backtestService'
import { createStrategyFingerprint, readStrategyFavorites, removeStrategyFavorite, saveStrategyFavorite } from '../services/strategyFavorites'
import { getBacktestCopy } from '../i18n/dashboardCopy'

const MAX_STRATEGIES = 5
const BACKTEST_COLORS = ['#4C78A8', '#F58518', '#54A24B', '#E45756', '#72B7B2']
const ENTRY_RULES = ['macd_cross', 'price_above_ma', 'price_breakout']
const EXIT_RULES = ['ma_break', 'macd_cross_down', 'price_breakdown', 'hist_positive']
const RESULT_COLUMNS = [
  { key: 'rank', defaultDirection: 'asc' },
  { key: 'strategy', defaultDirection: 'asc' },
  { key: 'cagr', defaultDirection: 'desc' },
  { key: 'total', defaultDirection: 'desc' },
  { key: 'maxDrawdown', defaultDirection: 'desc' },
  { key: 'sharpe', defaultDirection: 'desc' },
  { key: 'switches', defaultDirection: 'asc' },
  { key: 'current', defaultDirection: 'asc' },
]

const defaultEntryByType = {
  macd_cross: { type: 'macd_cross', fast: 12, slow: 26, signal: 9 },
  price_above_ma: { type: 'price_above_ma', maType: 'ema', window: 50 },
  price_breakout: { type: 'price_breakout', window: 20 },
}

const defaultExitByType = {
  ma_break: { type: 'ma_break', maType: 'ema', window: 15 },
  macd_cross_down: { type: 'macd_cross_down', fast: 12, slow: 26, signal: 9 },
  price_breakdown: { type: 'price_breakdown', window: 20 },
  hist_positive: { type: 'hist_positive', fast: 12, slow: 26, signal: 9 },
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeRuleGroup(group, defaultsByType) {
  if (Array.isArray(group?.rules) && group.rules.length) {
    return {
      logic: group.logic || 'and',
      rules: group.rules.map((rule) => ({ ...clone(defaultsByType[rule.type] || rule), ...rule })),
    }
  }
  const type = group?.type || Object.keys(defaultsByType)[0]
  const rules = [{ ...clone(defaultsByType[type] || defaultsByType[Object.keys(defaultsByType)[0]]), ...group, logic: undefined, requirePositiveHist: undefined }]
  if (group?.requirePositiveHist && defaultsByType.hist_positive) {
    rules.push(clone(defaultsByType.hist_positive))
  }
  return { logic: group?.logic || 'and', rules }
}

function updateRuleAt(rules, index, updater) {
  return rules.map((rule, ruleIndex) => (ruleIndex === index ? updater(rule) : rule))
}

function formatMetric(value, suffix = '') {
  if (value === null || value === undefined) return '—'
  return `${value}${suffix}`
}

function updateStrategy(strategies, id, updater) {
  return strategies.map((strategy) => (strategy.id === id ? updater(strategy) : strategy))
}

function normalizeTicker(value) {
  return value.trim().toUpperCase()
}

function formatChartValue(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatEquityMultiple(value) {
  return `${formatChartValue(value)}x`
}

function compareValues(left, right, direction) {
  const leftMissing = left === null || left === undefined
  const rightMissing = right === null || right === undefined
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1

  const comparison = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? comparison : -comparison
}

function localizeSummaryName(name, copy) {
  const match = String(name).match(/^([A-Z.]+) Buy & Hold$/)
  return match ? copy.values.buyHold(match[1]) : name
}

function localizeConditionLabel(label, copy) {
  if (label === 'Full exit signal') return copy.values.fullExitSignal
  const capeMatch = String(label).match(/^CAPE <= (.+)$/)
  if (capeMatch) return copy.values.capeMaximum(capeMatch[1])
  const closeBelowMatch = String(label).match(/^Close < (.+)$/)
  if (closeBelowMatch) return copy.values.closeBelow(closeBelowMatch[1])
  return label
}

function localizeTradeReason(reason, copy) {
  if (reason === 'Entry signal') return copy.values.entrySignal
  if (reason === 'Exit signal') return copy.values.exitSignal
  return reason
}

function localizeExplanation(explanation, copy) {
  const text = String(explanation)
  const latestSwitch = text.match(/^Latest signal schedules a switch to ([A-Z.]+) at the next open\.$/)
  if (latestSwitch) return copy.values.latestSwitch(latestSwitch[1])

  const histFilter = text.match(/^([A-Z.]+) triggered (.+), but Hist is not positive, so the full exit condition is not met\.$/)
  if (histFilter) return copy.values.riskHoldWithHistFilter(histFilter[1], localizeConditionLabel(histFilter[2], copy))

  const riskHold = text.match(/^The strategy remains in ([A-Z.]+); the configured exit group is not fully triggered\.$/)
  if (riskHold) return copy.values.riskHold(riskHold[1])

  const fallbackHold = text.match(/^The strategy remains in ([A-Z.]+); no entry signal is active on the latest completed bar\.$/)
  if (fallbackHold) return copy.values.fallbackHold(fallbackHold[1])

  return explanation
}

function EquityChart({ result, copy }) {
  const containerRef = useRef(null)
  const [hover, setHover] = useState(null)
  const curves = useMemo(() => {
    if (!result) return []
    return [
      ...(result.strategies || []).map((strategy, index) => ({
        name: strategy.summary.name,
        color: BACKTEST_COLORS[index],
        points: strategy.equityCurve,
      })),
      { name: localizeSummaryName(result.benchmark.summary.name, copy), color: '#7D7D86', points: result.benchmark.equityCurve },
    ]
  }, [copy, result])

  useEffect(() => {
    if (!containerRef.current || !curves.length) return undefined

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 900,
      height: 300,
      layout: { background: { color: 'transparent' }, textColor: '#6b7280' },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.14)' },
        horzLines: { color: 'rgba(148,163,184,0.14)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.28)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.28)',
        timeVisible: false,
        rightOffset: 0,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      localization: {
        priceFormatter: formatEquityMultiple,
      },
      crosshair: {
        vertLine: { color: 'rgba(0,122,255,0.55)', labelBackgroundColor: '#007aff' },
        horzLine: { color: 'rgba(0,122,255,0.35)', labelBackgroundColor: '#007aff' },
      },
    })

    curves.forEach((curve) => {
      const line = chart.addSeries(LineSeries, {
        color: curve.color,
        lineWidth: 2,
        priceFormat: { type: 'custom', formatter: formatEquityMultiple },
      })
      line.setData(curve.points.map((point) => ({ time: point.date, value: point.value })))
    })

    chart.subscribeCrosshairMove((param) => {
      if (!param?.time) {
        setHover(null)
        return
      }
      const date = String(param.time)
      const values = curves.map((curve) => ({
        name: curve.name,
        color: curve.color,
        value: curve.points.find((point) => point.date === date)?.value,
      })).filter((item) => item.value !== undefined)
      setHover(values.length ? { date, values } : null)
    })

    const lastIndex = (curves[0]?.points.length || 0) - 1

    function applyDataRange() {
      if (lastIndex > 0) {
        chart.timeScale().setVisibleLogicalRange({ from: 0, to: lastIndex })
      } else {
        chart.timeScale().fitContent()
      }
    }

    applyDataRange()

    function resizeChart() {
      chart.applyOptions({ width: containerRef.current?.clientWidth || 900 })
      applyDataRange()
    }
    window.addEventListener('resize', resizeChart)

    return () => {
      window.removeEventListener('resize', resizeChart)
      chart.remove()
    }
  }, [curves])

  if (!result) return null

  return (
    <section className="dashboard-card backtest-chart-card">
      <div className="section-heading">
        <h2>{copy.chart.title}</h2>
        <span className="status-pill">{result.alignedRange.startDate} - {result.alignedRange.endDate}</span>
      </div>
      <div className="backtest-chart-frame">
        <div className="backtest-chart-unit">{copy.chart.unit}</div>
        <div ref={containerRef} className="backtest-equity-chart" data-testid="backtest-equity-chart" role="img" aria-label={copy.chart.aria} />
      </div>
      {hover ? (
        <div className="backtest-chart-tooltip" role="status">
          <strong>{hover.date}</strong>
          {hover.values.map((item) => (
            <span key={item.name}>
              <i style={{ background: item.color }} />
              {item.name}: {copy.chart.tooltipValue(formatEquityMultiple(item.value))}
            </span>
          ))}
        </div>
      ) : null}
      <div className="backtest-chart-legend">
        {curves.map((curve) => (
          <span key={curve.name}>
            <i style={{ background: curve.color }} />
            {curve.name}
          </span>
        ))}
      </div>
    </section>
  )
}

function RuleFields({ rule, onChange, copy }) {
  function patchRule(nextPatch) {
    onChange({ ...rule, ...nextPatch })
  }

  if (rule.type === 'macd_cross' || rule.type === 'macd_cross_down' || rule.type === 'hist_positive') {
    return (
      <>
        <label>
          MACD Fast
          <input type="number" min="2" value={rule.fast} onChange={(event) => patchRule({ fast: Number(event.target.value) })} />
        </label>
        <label>
          MACD Slow
          <input type="number" min="3" value={rule.slow} onChange={(event) => patchRule({ slow: Number(event.target.value) })} />
        </label>
        <label>
          MACD Signal
          <input type="number" min="2" value={rule.signal} onChange={(event) => patchRule({ signal: Number(event.target.value) })} />
        </label>
      </>
    )
  }

  if (rule.type === 'price_above_ma' || rule.type === 'ma_break') {
    return (
      <>
        <label>
          {copy.strategy.maType}
          <select value={rule.maType} onChange={(event) => patchRule({ maType: event.target.value })}>
            <option value="ema">EMA</option>
            <option value="sma">SMA</option>
          </select>
        </label>
        <label>
          {copy.strategy.maWindow}
          <input type="number" min="2" value={rule.window} onChange={(event) => patchRule({ window: Number(event.target.value) })} />
        </label>
      </>
    )
  }

  return (
    <label>
      {rule.type === 'price_breakout' ? copy.strategy.breakoutWindow : copy.strategy.breakdownWindow}
      <input type="number" min="2" value={rule.window} onChange={(event) => patchRule({ window: Number(event.target.value) })} />
    </label>
  )
}

function RuleGroupEditor({ group, rules, labels, defaultsByType, onChange, copy }) {
  const normalizedGroup = normalizeRuleGroup(group, defaultsByType)
  const canRemoveRule = normalizedGroup.rules.length > 1

  function patchGroup(nextPatch) {
    onChange({ ...normalizedGroup, ...nextPatch })
  }

  function changeRuleType(index, type) {
    patchGroup({ rules: updateRuleAt(normalizedGroup.rules, index, () => clone(defaultsByType[type])) })
  }

  function changeRule(index, nextRule) {
    patchGroup({ rules: updateRuleAt(normalizedGroup.rules, index, () => nextRule) })
  }

  function addRule() {
    patchGroup({ rules: [...normalizedGroup.rules, clone(defaultsByType[rules[0]])] })
  }

  function removeRule(index) {
    if (!canRemoveRule) return
    patchGroup({ rules: normalizedGroup.rules.filter((_, ruleIndex) => ruleIndex !== index) })
  }

  return (
    <div className="rule-group">
      <label>
        {copy.strategy.conditionLogic}
        <select value={normalizedGroup.logic} onChange={(event) => patchGroup({ logic: event.target.value })}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </label>
      {normalizedGroup.rules.map((rule, ruleIndex) => (
        <div className="rule-row" key={`${rule.type}-${ruleIndex}`}>
          <div className="rule-row-header">
            <span className="status-pill">{copy.strategy.ruleLabel(ruleIndex)}</span>
            <button type="button" onClick={() => removeRule(ruleIndex)} disabled={!canRemoveRule}>{copy.strategy.removeRule}</button>
          </div>
          <div className="backtest-form-grid">
            <label>
              {copy.strategy.ruleType}
              <select value={rule.type} onChange={(event) => changeRuleType(ruleIndex, event.target.value)}>
                {rules.map((ruleType) => <option value={ruleType} key={ruleType}>{labels[ruleType]}</option>)}
              </select>
            </label>
            <RuleFields rule={rule} onChange={(nextRule) => changeRule(ruleIndex, nextRule)} copy={copy} />
          </div>
        </div>
      ))}
      <button type="button" className="secondary-action" onClick={addRule}>{copy.strategy.addRule}</button>
    </div>
  )
}

function SortableHeader({ column, sortConfig, onSort, copy }) {
  const isActive = sortConfig.key === column.key
  const directionLabel = isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'

  return (
    <th aria-sort={isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="table-sort-button" onClick={() => onSort(column)}>
        <span>{copy.results.columns[column.key]}</span>
        <span aria-hidden="true">{directionLabel}</span>
      </button>
    </th>
  )
}

function StrategyEditor({
  strategy,
  index,
  onChange,
  onDuplicate,
  onRemove,
  onFavorite,
  onToggleCollapsed,
  isCollapsed,
  isFavorite,
  canRemove,
  canDuplicate,
  copy,
}) {
  function patch(nextPatch) {
    onChange({ ...strategy, ...nextPatch })
  }

  return (
    <section className="dashboard-card strategy-editor" aria-label={copy.strategy.cardLabel(index, strategy.name)}>
      <div className="strategy-editor-header">
        <button type="button" className="strategy-disclosure" onClick={onToggleCollapsed} aria-expanded={!isCollapsed} aria-label={isCollapsed ? copy.strategy.expand : copy.strategy.collapse}>
          <span className="strategy-disclosure-icon" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
          <span className="status-pill">{copy.strategy.label(index)}</span>
          <span className="strategy-disclosure-copy">
            <strong>{strategy.name}</strong>
            <span>{copy.strategy.assets(strategy.signalAsset, strategy.riskAsset, strategy.fallbackAsset)}</span>
          </span>
        </button>
        <div className="strategy-editor-actions">
          <button type="button" className="strategy-favorite-button" onClick={onFavorite} aria-label={copy.strategy.favorite} title={copy.strategy.favorite} aria-pressed={isFavorite}>
            <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
          </button>
          <button type="button" onClick={onDuplicate} disabled={!canDuplicate}>{copy.strategy.duplicate}</button>
          <button type="button" onClick={onRemove} disabled={!canRemove}>{copy.strategy.remove}</button>
        </div>
      </div>
      {isCollapsed ? null : (
        <div className="strategy-editor-body">
      <label>
        {copy.strategy.name}
        <input value={strategy.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <div className="backtest-form-grid">
        <label>
          {copy.strategy.signal}
          <input value={strategy.signalAsset} onChange={(event) => patch({ signalAsset: normalizeTicker(event.target.value) })} />
        </label>
        <label>
          {copy.strategy.risk}
          <input value={strategy.riskAsset} onChange={(event) => patch({ riskAsset: normalizeTicker(event.target.value) })} />
        </label>
        <label>
          {copy.strategy.fallback}
          <input value={strategy.fallbackAsset} onChange={(event) => patch({ fallbackAsset: normalizeTicker(event.target.value) })} />
        </label>
      </div>
      <div className="rule-section">
        <h3>{copy.strategy.entryRule}</h3>
        <RuleGroupEditor
          group={strategy.entry}
          rules={ENTRY_RULES}
          labels={copy.entryRules}
          defaultsByType={defaultEntryByType}
          onChange={(entry) => patch({ entry })}
          copy={copy}
        />
      </div>
      <div className="rule-section">
        <h3>{copy.strategy.exitRule}</h3>
        <RuleGroupEditor
          group={strategy.exit}
          rules={EXIT_RULES}
          labels={copy.exitRules}
          defaultsByType={defaultExitByType}
          onChange={(exit) => patch({ exit })}
          copy={copy}
        />
      </div>
      <div className="rule-section risk-filter-section">
        <h3>{copy.strategy.riskFilter}</h3>
        <label className="backtest-checkbox">
          <input
            type="checkbox"
            checked={Boolean(strategy.riskFilter?.cape?.enabled)}
            onChange={(event) => patch({
              riskFilter: {
                ...strategy.riskFilter,
                cape: {
                  max: strategy.riskFilter?.cape?.max ?? 30,
                  ...strategy.riskFilter?.cape,
                  enabled: event.target.checked,
                },
              },
            })}
          />
          {copy.strategy.capeEnabled}
        </label>
        <label>
          {copy.strategy.capeMaximum}
          <input
            type="number"
            min="1"
            step="0.5"
            disabled={!strategy.riskFilter?.cape?.enabled}
            value={strategy.riskFilter?.cape?.max ?? 30}
            onChange={(event) => patch({
              riskFilter: {
                ...strategy.riskFilter,
                cape: {
                  ...strategy.riskFilter?.cape,
                  enabled: Boolean(strategy.riskFilter?.cape?.enabled),
                  max: Number(event.target.value),
                },
              },
            })}
          />
        </label>
        <p className="backtest-helper">{copy.strategy.capeHelper}</p>
      </div>
        </div>
      )}
    </section>
  )
}

export function BacktestLabPage() {
  const outletContext = useOutletContext()
  const language = outletContext?.language || 'en'
  const copy = getBacktestCopy(language)
  const [experiment, setExperiment] = useState(DEFAULT_BACKTEST_EXPERIMENT)
  const [result, setResult] = useState(null)
  const [selectedStrategyId, setSelectedStrategyId] = useState(DEFAULT_BACKTEST_EXPERIMENT.strategies[0].id)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' })
  const [favoriteStrategies, setFavoriteStrategies] = useState(() => readStrategyFavorites())
  const [collapsedStrategyIds, setCollapsedStrategyIds] = useState(() => new Set())

  const selectedResult = useMemo(() => {
    return result?.strategies?.find((strategy) => strategy.id === selectedStrategyId) || result?.strategies?.[0]
  }, [result, selectedStrategyId])

  const resultRows = useMemo(() => {
    if (!result) return []
    const strategyRows = result.strategies.map((strategy) => ({
      id: strategy.id,
      isBenchmark: false,
      rank: strategy.summary.rank,
      strategy: strategy.summary.name,
      cagr: strategy.summary.cagrPct,
      total: strategy.summary.totalReturnPct,
      maxDrawdown: strategy.summary.maxDrawdownPct,
      sharpe: strategy.summary.sharpe,
      switches: strategy.summary.switches,
      current: strategy.summary.currentHolding,
    }))
    const benchmarkRow = {
      id: 'benchmark',
      isBenchmark: true,
      rank: null,
      strategy: localizeSummaryName(result.benchmark.summary.name, copy),
      cagr: result.benchmark.summary.cagrPct,
      total: result.benchmark.summary.totalReturnPct,
      maxDrawdown: result.benchmark.summary.maxDrawdownPct,
      sharpe: result.benchmark.summary.sharpe,
      switches: 0,
      current: experiment.benchmark,
    }
    return [...strategyRows, benchmarkRow].sort((left, right) => {
      const primary = compareValues(left[sortConfig.key], right[sortConfig.key], sortConfig.direction)
      if (primary !== 0) return primary
      return compareValues(left.rank, right.rank, 'asc')
    })
  }, [copy, experiment.benchmark, result, sortConfig])

  const favoriteFingerprints = useMemo(() => {
    return new Set(favoriteStrategies.map((favorite) => favorite.fingerprint))
  }, [favoriteStrategies])

  function patchExperiment(nextPatch) {
    setExperiment((current) => ({ ...current, ...nextPatch }))
  }

  function sortResults(column) {
    setSortConfig((current) => {
      if (current.key === column.key) {
        return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key: column.key, direction: column.defaultDirection }
    })
  }

  function changeStrategy(id, nextStrategy) {
    setExperiment((current) => ({ ...current, strategies: updateStrategy(current.strategies, id, () => nextStrategy) }))
  }

  function toggleStrategyCollapsed(id) {
    setCollapsedStrategyIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function addStrategy() {
    setExperiment((current) => {
      if (current.strategies.length >= MAX_STRATEGIES) return current
      const next = createStrategy(current.strategies.length + 1, current.strategies[current.strategies.length - 1])
      setSelectedStrategyId(next.id)
      return { ...current, strategies: [...current.strategies, next] }
    })
  }

  function duplicateStrategy(strategy) {
    setExperiment((current) => {
      if (current.strategies.length >= MAX_STRATEGIES) return current
      const next = createStrategy(current.strategies.length + 1, strategy)
      setSelectedStrategyId(next.id)
      return { ...current, strategies: [...current.strategies, next] }
    })
  }

  function favoriteStrategy(strategy) {
    setFavoriteStrategies(saveStrategyFavorite(strategy))
  }

  function addFavoriteStrategy(favorite) {
    setExperiment((current) => {
      if (current.strategies.length >= MAX_STRATEGIES) return current
      const next = {
        ...createStrategy(current.strategies.length + 1, favorite.strategy),
        name: favorite.strategy.name,
      }
      setSelectedStrategyId(next.id)
      return { ...current, strategies: [...current.strategies, next] }
    })
  }

  function removeFavoriteStrategy(id) {
    setFavoriteStrategies(removeStrategyFavorite(id))
  }

  function removeStrategy(id) {
    setExperiment((current) => {
      const next = current.strategies.filter((strategy) => strategy.id !== id)
      setSelectedStrategyId(next[0]?.id)
      setCollapsedStrategyIds((currentIds) => {
        if (!currentIds.has(id)) return currentIds
        const nextIds = new Set(currentIds)
        nextIds.delete(id)
        return nextIds
      })
      return next.length ? { ...current, strategies: next } : current
    })
  }

  async function runExperiment(event) {
    event.preventDefault()
    setStatus('running')
    setError('')
    try {
      const payload = await runBacktestExperiment(experiment)
      setResult(payload)
      setSelectedStrategyId(payload.strategies?.[0]?.id || experiment.strategies[0].id)
      setStatus('complete')
    } catch (nextError) {
      setError(nextError.message)
      setStatus('error')
    }
  }

  return (
    <main className="dashboard-shell page-shell backtest-lab">
      <header className="page-header">
        <div>
          <p className="eyebrow">Backtest Lab</p>
          <h1>{copy.title}</h1>
        </div>
        <span className="status-pill">{copy.maxStrategies}</span>
      </header>

      <form className="backtest-layout" onSubmit={runExperiment}>
        <div className="backtest-left-column">
          <section className="dashboard-card backtest-controls">
            <div className="section-heading">
              <h2>{copy.controls.title}</h2>
              <span className="status-pill">{copy.status[status]}</span>
            </div>
            <label>
              {copy.controls.experimentName}
              <input value={experiment.name} onChange={(event) => patchExperiment({ name: event.target.value })} />
            </label>
            <div className="backtest-form-grid">
              <label>
                {copy.controls.start}
                <input type="date" value={experiment.startDate} onChange={(event) => patchExperiment({ startDate: event.target.value })} />
              </label>
              <label>
                {copy.controls.end}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}-\d{2}-\d{2}"
                  placeholder="YYYY-MM-DD"
                  value={experiment.endDate}
                  onChange={(event) => patchExperiment({ endDate: event.target.value })}
                />
              </label>
              <label>
                {copy.controls.benchmark}
                <input value={experiment.benchmark} onChange={(event) => patchExperiment({ benchmark: normalizeTicker(event.target.value) })} />
              </label>
            </div>
            <p className="helper-text">{copy.controls.helper}</p>
            <button className="primary-action" type="submit" disabled={status === 'running'}>
              {status === 'running' ? copy.controls.running : copy.controls.run}
            </button>
            {error ? <p className="backtest-error">{error}</p> : null}
          </section>

          <section className="favorite-strategies" aria-label={copy.favorites.section}>
            <div className="favorite-strategies-header">
              <h3>{copy.favorites.section}</h3>
              <span className="helper-text">{copy.favorites.helper}</span>
            </div>
            {favoriteStrategies.length ? (
              <div className="favorite-strategy-list">
                {favoriteStrategies.map((favorite) => (
                  <article className="favorite-strategy-item" key={favorite.id}>
                    <div>
                      <strong>{favorite.name}</strong>
                      <span>{copy.favorites.assets(favorite.strategy.signalAsset, favorite.strategy.riskAsset, favorite.strategy.fallbackAsset)}</span>
                    </div>
                    <div className="favorite-strategy-actions">
                      <button type="button" onClick={() => addFavoriteStrategy(favorite)} disabled={experiment.strategies.length >= MAX_STRATEGIES}>
                        {copy.favorites.add}
                      </button>
                      <button type="button" onClick={() => removeFavoriteStrategy(favorite.id)}>
                        {copy.favorites.remove}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="helper-text">{copy.favorites.empty}</p>
            )}
          </section>
        </div>

        <section className="strategy-stack" aria-label={copy.strategy.section}>
          <div className="section-heading">
            <h2>{copy.strategy.section}</h2>
            <button type="button" onClick={addStrategy} disabled={experiment.strategies.length >= MAX_STRATEGIES}>{copy.strategy.add}</button>
          </div>
          {experiment.strategies.map((strategy, index) => (
            <StrategyEditor
              strategy={strategy}
              index={index}
              onChange={(nextStrategy) => changeStrategy(strategy.id, nextStrategy)}
              onDuplicate={() => duplicateStrategy(strategy)}
              onRemove={() => removeStrategy(strategy.id)}
              onFavorite={() => favoriteStrategy(strategy)}
              onToggleCollapsed={() => toggleStrategyCollapsed(strategy.id)}
              isCollapsed={collapsedStrategyIds.has(strategy.id)}
              isFavorite={favoriteFingerprints.has(createStrategyFingerprint(strategy))}
              canRemove={experiment.strategies.length > 1}
              canDuplicate={experiment.strategies.length < MAX_STRATEGIES}
              copy={copy}
              key={strategy.id}
            />
          ))}
        </section>
      </form>

      {result ? (
        <>
          <section className="dashboard-card backtest-results">
            <div className="section-heading">
              <h2>{copy.results.title}</h2>
              <span className="status-pill">{copy.results.bars(result.alignedRange.rows)}</span>
            </div>
            <div className="table-scroll">
              <table className="backtest-table">
                <thead>
                  <tr>
                    {RESULT_COLUMNS.map((column) => (
                      <SortableHeader column={column} sortConfig={sortConfig} onSort={sortResults} copy={copy} key={column.key} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row) => (
                    <tr key={row.id} className={row.isBenchmark ? 'benchmark-row' : undefined}>
                      <td>{row.rank ?? '—'}</td>
                      <td>{row.strategy}</td>
                      <td>{formatMetric(row.cagr, '%')}</td>
                      <td>{formatMetric(row.total, '%')}</td>
                      <td>{formatMetric(row.maxDrawdown, '%')}</td>
                      <td>{formatMetric(row.sharpe)}</td>
                      <td>{row.switches}</td>
                      <td>{row.current}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <EquityChart result={result} copy={copy} />

          <section className="dashboard-card backtest-detail">
            <div className="section-heading">
              <h2>{copy.detail.title}</h2>
              <select value={selectedStrategyId} onChange={(event) => setSelectedStrategyId(event.target.value)}>
                {result.strategies.map((strategy) => (
                  <option value={strategy.id} key={strategy.id}>{strategy.summary.name}</option>
                ))}
              </select>
            </div>
            {selectedResult ? (
              <>
                <p className="backtest-explanation">{localizeExplanation(selectedResult.latestSignal.explanation, copy)}</p>
                <div className="signal-checklist">
                  {selectedResult.latestSignal.conditions.map((condition) => (
                    <span className={condition.passed ? 'passed' : 'failed'} key={condition.label}>
                      {localizeConditionLabel(condition.label, copy)}: {String(condition.value)} · {condition.passed ? copy.detail.yes : copy.detail.no}
                    </span>
                  ))}
                </div>
                <div className="table-scroll">
                  <table className="backtest-table">
                    <thead>
                      <tr>
                        <th>{copy.detail.columns.signalDate}</th>
                        <th>{copy.detail.columns.executionDate}</th>
                        <th>{copy.detail.columns.from}</th>
                        <th>{copy.detail.columns.to}</th>
                        <th>{copy.detail.columns.reason}</th>
                        <th>{copy.detail.columns.equity}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.trades.length ? [...selectedResult.trades].reverse().map((trade) => (
                        <tr key={`${trade.signalDate}-${trade.from}-${trade.to}`}>
                          <td>{trade.signalDate}</td>
                          <td>{trade.executionDate}</td>
                          <td>{trade.from}</td>
                          <td>{trade.to}</td>
                          <td>{localizeTradeReason(trade.reason, copy)}</td>
                          <td>{trade.equityAfterTrade}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="6">{copy.detail.noTrades}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}
