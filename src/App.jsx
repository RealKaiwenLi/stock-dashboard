import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { BacktestLabPage } from './pages/BacktestLabPage'
import { DashboardHome } from './pages/DashboardHome'
import { StockDetailPage } from './pages/StockDetailPage'
import { WatchlistPage } from './pages/WatchlistPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardHome />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/backtest" element={<BacktestLabPage />} />
          <Route path="/stocks/:ticker" element={<StockDetailPage />} />
          <Route path="*" element={<DashboardHome />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
