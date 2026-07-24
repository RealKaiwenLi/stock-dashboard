export const STRATEGY_CONFIG_VERSION = 2
export const POST_EXIT_REENTRY_SCHEMA_VERSION = 1

export const DEFAULT_POST_EXIT_REENTRY = Object.freeze({
  schemaVersion: POST_EXIT_REENTRY_SCHEMA_VERSION,
  enabled: false,
  cooldownTradingDays: 10,
  signalHandling: 'ignore',
  retentionTradingDays: 5,
  releaseValidation: {
    mode: 'revalidate_entry',
    group: {
      logic: 'and',
      rules: [{ assetRole: 'signal', type: 'macd_above_signal', fast: 12, slow: 26, signal: 9 }],
    },
  },
})

const RELEASE_TYPES = new Set([
  'macd_above_signal', 'macd_below_signal', 'hist_positive', 'hist_negative',
  'close_above_ma', 'close_below_ma', 'close_above_prior_high', 'close_below_prior_low',
])
const WINDOW_RELEASE_TYPES = new Set([
  'close_above_ma', 'close_below_ma', 'close_above_prior_high', 'close_below_prior_low',
])
const MACD_RELEASE_TYPES = new Set([
  'macd_above_signal', 'macd_below_signal', 'hist_positive', 'hist_negative',
])
const ASSET_ROLES = new Set(['signal', 'risk', 'fallback'])

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

export function normalizeStrategyConfig(strategy = {}) {
  const version = strategy.configVersion ?? 1
  if (version > STRATEGY_CONFIG_VERSION) {
    throw new Error(`Unsupported strategy config version: ${version}`)
  }
  const draft = strategy.postExitReentry
    ? { ...clone(DEFAULT_POST_EXIT_REENTRY), ...clone(strategy.postExitReentry) }
    : clone(DEFAULT_POST_EXIT_REENTRY)
  draft.schemaVersion = POST_EXIT_REENTRY_SCHEMA_VERSION
  draft.releaseValidation = {
    ...clone(DEFAULT_POST_EXIT_REENTRY.releaseValidation),
    ...(clone(strategy.postExitReentry?.releaseValidation) || {}),
    group: {
      ...clone(DEFAULT_POST_EXIT_REENTRY.releaseValidation.group),
      ...(clone(strategy.postExitReentry?.releaseValidation?.group) || {}),
    },
  }
  if (draft.enabled && isTradingDayInteger(draft.cooldownTradingDays)) draft.cooldownTradingDays = Number(draft.cooldownTradingDays)
  if (draft.enabled && draft.signalHandling === 'retain_latest' && isTradingDayInteger(draft.retentionTradingDays)) {
    draft.retentionTradingDays = Number(draft.retentionTradingDays)
  }
  if (draft.enabled && draft.signalHandling === 'retain_latest' && draft.releaseValidation.mode === 'rule_group') {
    draft.releaseValidation.group.rules = (draft.releaseValidation.group.rules || []).map((rule) => {
      const normalizedRule = { ...rule }
      for (const field of ['window', 'fast', 'slow', 'signal']) {
        if (isTradingDayInteger(normalizedRule[field])) normalizedRule[field] = Number(normalizedRule[field])
      }
      return normalizedRule
    })
  }
  const normalized = clone(strategy)
  delete normalized.latestSignal
  delete normalized.events
  delete normalized.pendingOrder
  delete normalized.deferredSignal
  return { ...normalized, configVersion: STRATEGY_CONFIG_VERSION, postExitReentry: draft }
}

function tradingDayError(path) {
  return { path, code: 'INVALID_TRADING_DAYS', messageKey: 'validation.tradingDays' }
}

function isTradingDayInteger(value) {
  if (typeof value === 'string' && (!/^\d+$/.test(value) || /e/i.test(value))) return false
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 252
}

export function validateStrategyConfig(input) {
  let strategy
  try {
    strategy = normalizeStrategyConfig(input)
  } catch {
    return [{ path: 'configVersion', code: 'UNSUPPORTED_CONFIG_VERSION', messageKey: 'validation.configVersion' }]
  }
  const policy = strategy.postExitReentry
  if (!policy.enabled) return []
  const errors = []
  if (!isTradingDayInteger(policy.cooldownTradingDays)) errors.push(tradingDayError('postExitReentry.cooldownTradingDays'))
  if (!['ignore', 'retain_latest'].includes(policy.signalHandling)) {
    errors.push({ path: 'postExitReentry.signalHandling', code: 'INVALID_SIGNAL_HANDLING', messageKey: 'validation.signalHandling' })
    return errors
  }
  if (policy.signalHandling === 'ignore') return errors
  if (!isTradingDayInteger(policy.retentionTradingDays)) errors.push(tradingDayError('postExitReentry.retentionTradingDays'))
  const validation = policy.releaseValidation || {}
  if (!['signal_still_valid', 'revalidate_entry', 'rule_group'].includes(validation.mode)) {
    errors.push({ path: 'postExitReentry.releaseValidation.mode', code: 'INVALID_RELEASE_MODE', messageKey: 'validation.releaseMode' })
    return errors
  }
  if (validation.mode !== 'rule_group') return errors
  const rules = validation.group?.rules
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push({ path: 'postExitReentry.releaseValidation.group.rules', code: 'EMPTY_RELEASE_RULES', messageKey: 'validation.releaseRules' })
    return errors
  }
  rules.forEach((rule, index) => {
    const base = `postExitReentry.releaseValidation.group.rules[${index}]`
    if (!ASSET_ROLES.has(rule.assetRole)) errors.push({ path: `${base}.assetRole`, code: 'INVALID_ASSET_ROLE', messageKey: 'validation.assetRole' })
    if (!RELEASE_TYPES.has(rule.type)) errors.push({ path: `${base}.type`, code: 'INVALID_RELEASE_RULE', messageKey: 'validation.releaseRule' })
    if (rule.assetRole === 'fallback' && String(strategy.fallbackAsset).toUpperCase() === 'CASH') {
      errors.push({ path: `${base}.assetRole`, code: 'CASH_RULE_UNSUPPORTED', messageKey: 'validation.cashRule' })
    }
    if (WINDOW_RELEASE_TYPES.has(rule.type)) {
      if (!isTradingDayInteger(rule.window)) errors.push(tradingDayError(`${base}.window`))
    }
    if (MACD_RELEASE_TYPES.has(rule.type)) {
      for (const field of ['fast', 'slow', 'signal']) {
        if (!isTradingDayInteger(rule[field])) errors.push(tradingDayError(`${base}.${field}`))
      }
    }
  })
  return errors
}

const DEFAULT_POST_EXIT_SUMMARY_COPY = {
  off: 'Post-exit re-entry: off',
  ignore: (cooldown) => `After an exit, cool down for ${cooldown} trading days and ignore entry signals during the cooldown.`,
  retain: (cooldown, retention, releaseMode) => `After an exit, cool down for ${cooldown} trading days; retain the latest entry signal for ${retention} trading days; then validate it using ${releaseMode}.`,
  releaseModes: {
    signal_still_valid: 'signal remains valid',
    revalidate_entry: 'entry rules',
    rule_group: 'release rule group',
  },
}

export function summarizePostExitReentry(strategy, summaryCopy = DEFAULT_POST_EXIT_SUMMARY_COPY) {
  const policy = normalizeStrategyConfig(strategy).postExitReentry
  if (!policy.enabled) return summaryCopy.off
  if (policy.signalHandling === 'ignore') {
    return summaryCopy.ignore(policy.cooldownTradingDays)
  }
  const releaseMode = summaryCopy.releaseModes[policy.releaseValidation.mode] || policy.releaseValidation.mode
  return summaryCopy.retain(policy.cooldownTradingDays, policy.retentionTradingDays, releaseMode)
}
