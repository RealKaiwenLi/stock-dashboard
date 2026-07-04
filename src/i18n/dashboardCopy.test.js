import { describe, expect, it } from 'vitest'
import {
  getComponentCopy,
  getDashboardCopy,
  getIndexName,
  getLocalizedStatusLabel,
} from './dashboardCopy'

describe('dashboardCopy', () => {
  it('provides Chinese and English dashboard labels', () => {
    const zh = getDashboardCopy('zh')
    const en = getDashboardCopy('en')

    expect(zh.nav.home).toBe('首页')
    expect(en.nav.home).toBe('Home')
    expect(zh.labels.lastUpdated).toBe('最后更新时间')
    expect(en.labels.lastUpdated).toBe('Last updated')
    expect(zh.explanationTrigger).toBe('如何计算？')
    expect(en.explanationTrigger).toBe('How is this calculated?')
    expect(en.disclaimer).toBe('This page summarizes market conditions and is not financial advice.')
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
    expect(getComponentCopy({ name: 'VOLATILITY', description: 'VIX vs average' }, 'zh').label).toBe('波动率')
    expect(getComponentCopy({ name: 'VOLATILITY', description: 'VIX vs average' }, 'en').label).toBe('Volatility')
  })
})
