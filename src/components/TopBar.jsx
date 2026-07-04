import { NavLink } from 'react-router-dom'

function formatUpdatedAt(value, language) {
  if (!value) return '未知'
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function TopBar({
  copy,
  language,
  onLanguageChange,
  lastUpdated,
  dataDelayMinutes,
  marketStatus,
  connectionStatus,
}) {
  return (
    <header className="top-bar">
      <div className="top-brand">
        <span className="brand-mark" aria-hidden="true">
          M
        </span>
        <div className="brand-copy">
          <p>{copy.brand.kicker}</p>
          <h1>{copy.appTitle}</h1>
        </div>
      </div>

      <nav className="app-nav" aria-label={copy.labels.mainNavigation}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
          {copy.nav.home}
        </NavLink>
        <NavLink to="/watchlist" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          {copy.nav.watchlist}
        </NavLink>
        <NavLink to="/backtest" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          {copy.nav.backtest}
        </NavLink>
      </nav>

      <div className="top-actions">
        <label className="language-select">
          <span>{copy.labels.language}</span>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            {(['en', 'zh']).map((option) => (
              <option value={option} key={option}>
                {copy.language[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="top-status" aria-label={copy.regions.dataStatus}>
          <span>
            <small>{copy.labels.lastUpdated}</small>
            <strong>{formatUpdatedAt(lastUpdated, language)}</strong>
          </span>
          <span>
            <small>{copy.labels.dataDelayLabel}</small>
            <strong>{copy.labels.dataDelay(dataDelayMinutes)}</strong>
          </span>
          <span>
            <small>{copy.labels.marketStatus}</small>
            <strong>{marketStatus}</strong>
          </span>
          <span className="live-status">
            <small>{copy.labels.feedStatus}</small>
            <strong>{connectionStatus}</strong>
          </span>
        </div>
      </div>
    </header>
  )
}
