import { describe, expect, it, vi } from 'vitest'
import {
  defaultIndicatorPreferences,
  INDICATOR_PREFERENCES_KEY,
  readIndicatorPreferences,
  writeIndicatorPreferences,
} from './indicatorPreferences'

function createStorage(initialValue) {
  const store = new Map(initialValue ? [[INDICATOR_PREFERENCES_KEY, initialValue]] : [])
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
  }
}

describe('indicatorPreferences', () => {
  it('defaults to MACD only', () => {
    expect(readIndicatorPreferences(createStorage())).toEqual(defaultIndicatorPreferences)
  })

  it('persists and normalizes user choices', () => {
    const storage = createStorage()

    writeIndicatorPreferences(
      {
        vwap: true,
        macd: false,
        movingAverages: { ma20: true, ma200: true },
      },
      storage,
    )

    expect(readIndicatorPreferences(storage)).toEqual({
      vwap: true,
      bollinger: false,
      macd: false,
      kdj: false,
      movingAverages: { ma20: true, ma50: false, ma100: false, ma200: true },
    })
  })

  it('falls back to defaults for corrupt storage', () => {
    expect(readIndicatorPreferences(createStorage('{nope'))).toEqual(defaultIndicatorPreferences)
  })
})
