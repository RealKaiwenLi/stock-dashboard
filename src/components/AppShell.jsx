import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { getDashboardCopy } from '../i18n/dashboardCopy'

const shellMarketData = {
  lastUpdated: '2026-06-05T16:45:00.000Z',
  dataDelayMinutes: 15,
  marketStatus: { zh: '模拟数据', en: 'Mock data' },
  connectionStatus: { zh: '模拟实时', en: 'Mock live' },
}

export function AppShell() {
  const [language, setLanguage] = useState('en')
  const copy = getDashboardCopy(language)

  return (
    <>
      <TopBar
        copy={copy}
        language={language}
        onLanguageChange={setLanguage}
        lastUpdated={shellMarketData.lastUpdated}
        dataDelayMinutes={shellMarketData.dataDelayMinutes}
        marketStatus={shellMarketData.marketStatus[language]}
        connectionStatus={shellMarketData.connectionStatus[language]}
      />
      <Outlet context={{ language, copy }} />
    </>
  )
}
