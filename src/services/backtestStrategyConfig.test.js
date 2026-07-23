import { describe, expect, it } from 'vitest'
import { normalizeStrategyConfig, summarizePostExitReentry, validateStrategyConfig } from './backtestStrategyConfig'

describe('backtestStrategyConfig', () => {
  it('migrates old configurations to v2/off without mutating input', () => {
    const old = { name: 'old' }
    const result = normalizeStrategyConfig(old)
    expect(result.configVersion).toBe(2)
    expect(result.postExitReentry.enabled).toBe(false)
    expect(old.postExitReentry).toBeUndefined()
  })

  it('preserves disabled draft fields while stripping runtime fields', () => {
    const result = normalizeStrategyConfig({
      postExitReentry: { enabled: false, cooldownTradingDays: 'bad' },
      events: [{ eventType: 'runtime' }],
    })
    expect(result.postExitReentry.cooldownTradingDays).toBe('bad')
    expect(result.events).toBeUndefined()
    expect(validateStrategyConfig(result)).toEqual([])
    expect(summarizePostExitReentry(result)).toContain('off')
  })

  it('localizes retained-signal summaries through injected copy', () => {
    const summary = summarizePostExitReentry({
      postExitReentry: {
        enabled: true,
        cooldownTradingDays: 10,
        signalHandling: 'retain_latest',
        retentionTradingDays: 5,
        releaseValidation: { mode: 'signal_still_valid' },
      },
    }, {
      off: '关闭',
      ignore: (cooldown) => `忽略 ${cooldown}`,
      retain: (cooldown, retention, releaseMode) => `冷却 ${cooldown}，保留 ${retention}，${releaseMode}`,
      releaseModes: { signal_still_valid: '信号仍有效' },
    })

    expect(summary).toBe('冷却 10，保留 5，信号仍有效')
  })

  it.each(['', 0, 1.5, 253, '1e999', 'wat'])('rejects invalid active cooldown %s', (value) => {
    const errors = validateStrategyConfig({ postExitReentry: { enabled: true, cooldownTradingDays: value, signalHandling: 'ignore' } })
    expect(errors[0].path).toBe('postExitReentry.cooldownTradingDays')
  })

  it('short-circuits inactive fields and locates release rule errors', () => {
    expect(validateStrategyConfig({ postExitReentry: { enabled: true, cooldownTradingDays: 2, signalHandling: 'ignore', retentionTradingDays: 'x' } })).toEqual([])
    const [error] = validateStrategyConfig({
      fallbackAsset: 'CASH',
      postExitReentry: {
        enabled: true, cooldownTradingDays: 2, signalHandling: 'retain_latest', retentionTradingDays: 3,
        releaseValidation: { mode: 'rule_group', group: { rules: [{ assetRole: 'fallback', type: 'close_above_ma', maType: 'ema', window: 10 }] } },
      },
    })
    expect(error.path).toBe('postExitReentry.releaseValidation.group.rules[0].assetRole')
  })

  it('rejects future config versions', () => {
    expect(() => normalizeStrategyConfig({ configVersion: 99 })).toThrow(/Unsupported/)
  })
})
