import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fixture = JSON.parse(readFileSync('backend/fixtures/post_exit_reentry_cases.json', 'utf8'))
globalThis.__ASSETS_MANIFEST__ = {}
const { evaluateStateRule, normalizePostExitReentry, runStrategy } = await import('./sites-worker-runtime')

describe('Sites Worker post-exit re-entry parity contract', () => {
  it('runs every shared case through the Worker production state machine', () => {
    expect(fixture.schemaVersion).toBe(1)
    fixture.cases.forEach((caseItem) => {
      const strategy = structuredClone(fixture.strategy)
      if (caseItem.policy) strategy.postExitReentry = caseItem.policy
      const rows = fixture.rows.slice(0, caseItem.rowCount)
      const result = runStrategy(rows, strategy, 0, { cagrPct: 0 }, {
        entry: caseItem.entrySignals,
        exit: caseItem.exitSignals,
      })
      expect(result.trades.map((trade) => ({
        signalDate: trade.signalDate, releaseDate: trade.releaseDate,
        executionDate: trade.executionDate, from: trade.from, to: trade.to,
      })), caseItem.name).toEqual(caseItem.expected.trades)
      expect(result.events.map((event) => ({
        eventDate: event.eventDate, eventType: event.eventType,
      })), caseItem.name).toEqual(caseItem.expected.events)
      expect(result.equityCurve.map((point) => point.value), caseItem.name).toEqual(caseItem.expected.equity)
      expect({
        deferredEntries: result.summary.deferredEntries,
        expiredSignals: result.summary.expiredSignals,
        rejectedSignals: result.summary.rejectedSignals,
      }, caseItem.name).toEqual(caseItem.expected.counts)
      const actualLatest = {
        enabled: result.latestSignal.postExitReentry.enabled,
        state: result.latestSignal.postExitReentry.state,
        actualHolding: result.latestSignal.actualHolding,
        nextTarget: result.latestSignal.nextTarget,
        releaseValidationPassed: result.latestSignal.postExitReentry.releaseValidation?.passed ?? null,
        hasPendingOrder: result.latestSignal.postExitReentry.pendingOrder != null,
      }
      if ('releaseConditionCount' in caseItem.expected.latest) {
        actualLatest.releaseConditionCount = result.latestSignal.postExitReentry.releaseValidation.conditions.length
      }
      if ('earliestReleaseOutOfRange' in caseItem.expected.latest) {
        actualLatest.earliestReleaseOutOfRange = result.latestSignal.postExitReentry.earliestReleaseOutOfRange
        actualLatest.deferredValidThroughOutOfRange = result.latestSignal.postExitReentry.deferredSignal.validThroughOutOfRange
      }
      expect(actualLatest, caseItem.name).toEqual(caseItem.expected.latest)
      if (caseItem.expected.dualSourceSignalDates) {
        const scheduled = result.events.find((event) => event.eventType === 'Order Scheduled' && event.releaseDate)
        expect(scheduled.sourceSignalDates, caseItem.name).toEqual(caseItem.expected.dualSourceSignalDates)
      }
      if (caseItem.expected.releaseSnapshot) {
        const releaseEvent = result.events.find((event) => ['Release Passed', 'Release Rejected'].includes(event.eventType))
        expect(releaseEvent.ruleSnapshot, caseItem.name).toEqual(caseItem.expected.releaseSnapshot)
      }
    })
  })

  it('defaults missing config to disabled and validates active trading days', () => {
    expect(normalizePostExitReentry({}).enabled).toBe(false)
    expect(() => normalizePostExitReentry({
      postExitReentry: { enabled: true, cooldownTradingDays: 0, signalHandling: 'ignore' },
    })).toThrow(/1 to 252/)
  })

  it('does not validate inactive retained-signal draft fields', () => {
    expect(normalizePostExitReentry({
      postExitReentry: { enabled: true, cooldownTradingDays: 2, signalHandling: 'ignore', retentionTradingDays: 'old draft' },
    }).signalHandling).toBe('ignore')
  })

  it('matches shared invalid candidate paths', () => {
    fixture.invalidCases.forEach((caseItem) => {
      const strategy = structuredClone(fixture.strategy)
      strategy.postExitReentry = caseItem.policy
      try {
        normalizePostExitReentry(strategy)
        throw new Error('Expected validation failure')
      } catch (error) {
        expect(error.path, caseItem.name).toBe(caseItem.path)
      }
    })
  })

  it('keeps all eight current-state rules independent of future rows', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      date: `2024-01-${String(index + 1).padStart(2, '0')}`,
      SIG_open: 100 + index,
      SIG_close: 100 + index + (index % 3),
      RISK_open: 100,
      RISK_close: 100,
    }))
    const strategy = { signalAsset: 'SIG', riskAsset: 'RISK', fallbackAsset: 'CASH' }
    const rules = [
      ...['macd_above_signal', 'macd_below_signal', 'hist_positive', 'hist_negative']
        .map((type) => ({ assetRole: 'signal', type, fast: 2, slow: 3, signal: 2 })),
      ...['close_above_ma', 'close_below_ma']
        .map((type) => ({ assetRole: 'signal', type, maType: 'ema', window: 3 })),
      ...['close_above_prior_high', 'close_below_prior_low']
        .map((type) => ({ assetRole: 'signal', type, window: 3 })),
    ]
    rules.forEach((rule) => {
      const before = evaluateStateRule(rows, strategy, rule, 10)
      const changed = rows.map((row, index) => index > 10 ? { ...row, SIG_open: 1000000, SIG_close: 1000000 } : row)
      expect(evaluateStateRule(changed, strategy, rule, 10), rule.type).toEqual(before)
    })
  })
})
