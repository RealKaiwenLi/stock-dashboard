import { describe, expect, it, vi } from 'vitest'
import { getFearGreedData } from './fearGreedService'
import { writeFearGreedCache } from './fearGreedCache'

function createStorage() {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value
    },
    removeItem: (key) => {
      delete store[key]
    },
  }
}

describe('getFearGreedData', () => {
  it('returns unexpired cache without calling the API', async () => {
    const storage = createStorage()
    writeFearGreedCache({ score: 55 }, { storage, now: () => 1_000 })
    const fetchFearGreedDataImpl = vi.fn()

    await expect(
      getFearGreedData({ storage, now: () => 2_000, fetchFearGreedDataImpl }),
    ).resolves.toMatchObject({ score: 55, fromCache: true })
    expect(fetchFearGreedDataImpl).not.toHaveBeenCalled()
  })

  it('fetches, caches and returns API data when cache is missing', async () => {
    const storage = createStorage()
    const fetchFearGreedDataImpl = vi.fn(async () => ({ score: 70 }))

    await expect(
      getFearGreedData({ storage, now: () => 2_000, fetchFearGreedDataImpl }),
    ).resolves.toMatchObject({ score: 70, fromCache: false })
    expect(fetchFearGreedDataImpl).toHaveBeenCalled()
  })

  it('returns null when API fails and there is no valid cache', async () => {
    const storage = createStorage()
    const fetchFearGreedDataImpl = vi.fn(async () => {
      throw new Error('network failed')
    })

    await expect(
      getFearGreedData({ storage, now: () => 2_000, fetchFearGreedDataImpl }),
    ).resolves.toBeNull()
  })
})
