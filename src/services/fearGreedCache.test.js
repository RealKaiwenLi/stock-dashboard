import { describe, expect, it, vi } from 'vitest'
import { readFearGreedCache, writeFearGreedCache } from './fearGreedCache'

function createStorage() {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => {
      store[key] = value
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
  }
}

describe('Fear & Greed localStorage cache', () => {
  it('returns a cache hit within 15 minutes', () => {
    const storage = createStorage()
    writeFearGreedCache({ score: 62 }, { storage, now: () => 1_000 })

    expect(readFearGreedCache({ storage, now: () => 1_000 + 14 * 60 * 1000 })).toMatchObject({
      score: 62,
      fromCache: true,
    })
  })

  it('returns null for missing, expired or corrupt cache values', () => {
    const missingStorage = createStorage()
    expect(readFearGreedCache({ storage: missingStorage, now: () => 1_000 })).toBeNull()

    const expiredStorage = createStorage()
    writeFearGreedCache({ score: 62 }, { storage: expiredStorage, now: () => 1_000 })
    expect(readFearGreedCache({ storage: expiredStorage, now: () => 1_000 + 16 * 60 * 1000 })).toBeNull()

    const corruptStorage = createStorage()
    corruptStorage.setItem('fear-greed-cache-v1', '{bad json')
    expect(readFearGreedCache({ storage: corruptStorage, now: () => 1_000 })).toBeNull()
    expect(corruptStorage.removeItem).toHaveBeenCalledWith('fear-greed-cache-v1')
  })
})
