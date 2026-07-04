import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { WATCHLIST_STORAGE_KEY } from '../services/watchlistStorage'
import { WatchlistPage } from './WatchlistPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
  )
}

describe('WatchlistPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('searches mock stocks and adds a watchlist card', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText('还没有收藏股票')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜索股票' }), 'AAPL')

    expect(await screen.findByText('Apple Inc.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加' }))

    expect(await screen.findByRole('article', { name: 'AAPL watchlist card' })).toBeInTheDocument()
    expect(screen.getByText('214.18')).toBeInTheDocument()
    expect(screen.getAllByText('模拟实时').length).toBeGreaterThan(0)
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY))).toEqual([expect.objectContaining({ symbol: 'AAPL' })])
  })

  it('deletes a card without navigating to detail', async () => {
    const user = userEvent.setup()
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{ symbol: 'AAPL', name: 'Apple Inc.' }]))
    renderPage()

    expect(await screen.findByRole('article', { name: 'AAPL watchlist card' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除 AAPL' }))

    await waitFor(() => expect(screen.queryByRole('article', { name: 'AAPL watchlist card' })).not.toBeInTheDocument())
    expect(window.location.pathname).not.toBe('/stocks/AAPL')
  })

  it('links card body to the stock detail URL', async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{ symbol: 'AAPL', name: 'Apple Inc.' }]))
    renderPage()

    expect(await screen.findByRole('link', { name: /Apple Inc. AAPL/ })).toHaveAttribute('href', '/stocks/AAPL')
  })
})
