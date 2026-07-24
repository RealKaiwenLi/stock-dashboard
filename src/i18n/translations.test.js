import { describe, expect, it } from 'vitest'
import {
  getComponentTranslation,
  getBacktestTranslations,
  getDashboardTranslations,
  getIndexName,
  getLocalizedStatusLabel,
} from './translations'

describe('translations', () => {
  it('provides Chinese and English dashboard labels', () => {
    const zh = getDashboardTranslations('zh')
    const en = getDashboardTranslations('en')

    expect(zh.nav.home).toBe('首页')
    expect(en.nav.home).toBe('Home')
    expect(zh.labels.lastUpdated).toBe('最后更新时间')
    expect(en.labels.lastUpdated).toBe('Last updated')
    expect(zh.explanationTrigger).toBe('如何计算？')
    expect(en.explanationTrigger).toBe('How is this calculated?')
    expect(en.disclaimer).toBe('This page summarizes market conditions and is not financial advice.')
  })

  it('provides localized post-exit re-entry guidance', () => {
    const zhBacktest = getBacktestTranslations('zh')
    const enBacktest = getBacktestTranslations('en')
    const zh = zhBacktest.strategy
    const en = enBacktest.strategy

    expect(zh.retention).toBe('新入场信号保留交易日数')
    expect(zhBacktest.controls.deleteExperimentConfirm('测试实验')).toContain('测试实验')
    expect(zh.postExitSummary.retain(10, 5, '信号仍有效即可')).toContain('保留 5 个交易日')
    expect(en.postExitSummary.retain(10, 5, 'signal remains valid')).toContain('retain the latest entry signal for 5 trading days')
  })

  it('localizes status labels and falls back to the given label', () => {
    expect(getLocalizedStatusLabel('偏强', 'en')).toBe('Strong')
    expect(getLocalizedStatusLabel('正常', 'en')).toBe('Normal')
    expect(getLocalizedStatusLabel('科技股领涨', 'en')).toBe('Tech-led')
    expect(getLocalizedStatusLabel('unmapped', 'en')).toBe('unmapped')
    expect(getLocalizedStatusLabel('偏强', 'zh')).toBe('偏强')
  })

  it('localizes index and Fear & Greed component copy', () => {
    expect(getIndexName({ symbol: 'SPY', nameZh: '标普 500' }, 'zh')).toBe('标普 500')
    expect(getIndexName({ symbol: 'SPY', nameZh: '标普 500' }, 'en')).toBe('S&P 500')
    expect(getComponentTranslation({ name: 'VOLATILITY', description: 'VIX vs average' }, 'zh').label).toBe('波动率')
    expect(getComponentTranslation({ name: 'VOLATILITY', description: 'VIX vs average' }, 'en').label).toBe('Volatility')
  })
})
