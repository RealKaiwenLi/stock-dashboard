/* global __ASSETS_MANIFEST__ */

const assets = __ASSETS_MANIFEST__

const NOTION_VERSION = '2022-06-28'
const CAPE_HISTORY_URL = 'https://www.multpl.com/shiller-pe/table/by-month'
const DAY_MS = 24 * 60 * 60 * 1000
const CAPE_CACHE_TTL_MS = DAY_MS
const DAILY_RECOMMENDATION_CACHE_TTL_MS = 15 * 60 * 1000
const MAX_STRATEGIES = 5

let capeCache = null
const dailyRecommendationCache = new Map()

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Content-Type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    },
  })

const cacheable = (pathname) => pathname.startsWith('/assets/')

const serveAsset = (pathname) => {
  const asset = assets[pathname]

  if (!asset) {
    return null
  }

  const bytes = Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    headers: {
      'content-type': asset.contentType,
      'cache-control': cacheable(pathname)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    },
  })
}

const isoDate = (date) => date.toISOString().slice(0, 10)

const parseIsoDate = (value) => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Date must use YYYY-MM-DD.')
  }
  return date
}

const parseDateRange = (url) => {
  const now = new Date()
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  const start = parseIsoDate(url.searchParams.get('from')) ?? defaultStart
  const end = parseIsoDate(url.searchParams.get('to')) ?? defaultEnd

  if (start > end) {
    const error = new Error('from must be before or equal to to.')
    error.code = 'INVALID_DATE_RANGE'
    error.status = 400
    throw error
  }

  return { start, end }
}

const notionRequest = async (method, url, token, payload) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  })

  if (!response.ok) {
    const body = await response.text()
    const error = new Error(response.status === 401 || response.status === 403
      ? 'Notion credentials cannot access the database.'
      : `Notion API ${response.status}: ${body}`)
    error.code = response.status === 401 || response.status === 403 ? 'NOTION_UNAUTHORIZED' : 'NOTION_REQUEST_FAILED'
    error.status = 502
    throw error
  }

  return response.json()
}

const richTextPlain = (items) => (items ?? []).map((item) => item.plain_text ?? '').join('').trim()

const buildNotionQueryPayload = (range, startCursor) => {
  const payload = {
    filter: {
      and: [
        { property: '报告类型', select: { equals: '纳斯达克指引' } },
        { property: 'Date', date: { on_or_after: isoDate(range.start) } },
        { property: 'Date', date: { on_or_before: isoDate(range.end) } },
      ],
    },
    sorts: [{ property: 'Date', direction: 'ascending' }],
    page_size: 100,
  }
  if (startCursor) payload.start_cursor = startCursor
  return payload
}

const queryNotionPages = async (databaseId, token, range) => {
  const pages = []
  let cursor
  do {
    const response = await notionRequest(
      'POST',
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      token,
      buildNotionQueryPayload(range, cursor),
    )
    pages.push(...(response.results ?? []))
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor)
  return pages
}

const listNotionChildren = async (blockId, token) => {
  const children = []
  let cursor
  do {
    const suffix = cursor ? `&start_cursor=${cursor}` : ''
    const response = await notionRequest(
      'GET',
      `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${suffix}`,
      token,
    )
    children.push(...(response.results ?? []))
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor)
  return children
}

const labelKeyMap = {
  '模型版本': 'modelVersion',
  '最新完成日线日期': 'latestBarDate',
  '最新收盘价': 'latestClose',
  '当前收盘后状态': 'holdAfterClose',
  '次日开盘动作': 'action',
  '次日开盘应持有': 'holdForNextOpen',
  MACD: 'macd',
  Signal: 'signal',
  Hist: 'hist',
  '当日金叉': 'signalGoldenCross',
  '当日 Hist > 0': 'histPositive',
  '当日完整退出信号': 'fullExitSignal',
}

const parseBool = (value) => {
  const normalized = value.trim().toLowerCase()
  if (['是', 'yes', 'true', '1'].includes(normalized)) return true
  if (['否', 'no', 'false', '0'].includes(normalized)) return false
  return null
}

const parseNumber = (value) => {
  const number = Number(value.replaceAll(',', ''))
  return Number.isFinite(number) ? number : null
}

const normalizeValue = (key, value) => {
  if (['signalGoldenCross', 'histPositive', 'fullExitSignal', 'priceBelowExitEma'].includes(key)) return parseBool(value)
  if (['latestClose', 'macd', 'signal', 'hist', 'exitEma'].includes(key)) return parseNumber(value)
  return value || null
}

const parseTableRows = (tableRows) => {
  const parsed = {}
  for (const row of tableRows) {
    const cells = row.table_row?.cells ?? []
    if (cells.length < 2) continue
    const label = richTextPlain(cells[0])
    const value = richTextPlain(cells[1]).replace(/^`|`$/g, '')
    const key = labelKeyMap[label]
    if (key) parsed[key] = normalizeValue(key, value)
    else if (/^EMA\d+$/.test(label)) {
      parsed.exitEmaLabel = label
      parsed.exitEma = normalizeValue('exitEma', value)
    } else if (/^收盘价低于 EMA\d+$/.test(label)) {
      parsed.priceBelowExitEma = normalizeValue('priceBelowExitEma', value)
    }
  }
  return parsed
}

const blockText = (block) => {
  const type = block.type
  return type ? richTextPlain(block[type]?.rich_text ?? []) : ''
}

const parseNotionPageBlocks = async (pageId, token) => {
  const children = await listNotionChildren(pageId, token)
  const details = {}
  const explanationParts = []
  let inExplanation = false

  for (const block of children) {
    const text = blockText(block)
    if (block.type === 'heading_2') {
      inExplanation = text === '判断说明'
    } else if (block.type === 'table') {
      Object.assign(details, parseTableRows(await listNotionChildren(block.id, token)))
    } else if (inExplanation && block.type === 'paragraph' && text) {
      explanationParts.push(text)
    }
  }

  if (explanationParts.length) details.explanation = explanationParts.join('\n')
  return details
}

const parseHoldingFromTitle = (title) => title.match(/\b([A-Z]{2,5}|CASH)\b$/)?.[1] ?? null

const parseNotionPage = async (page, token) => {
  const properties = page.properties ?? {}
  const title = richTextPlain(properties['Doc name']?.title ?? [])
  const reportDate = properties.Date?.date?.start
  const recommended = richTextPlain(properties['Key Tickers']?.rich_text ?? []) || parseHoldingFromTitle(title)
  if (!reportDate || !recommended) return null

  const item = {
    date: reportDate,
    recommendedHolding: recommended,
    holdForNextOpen: recommended,
    action: 'HOLD',
    status: properties.Status?.select?.name,
    notionUrl: page.url,
  }

  Object.assign(item, await parseNotionPageBlocks(page.id, token))
  item.recommendedHolding = item.holdForNextOpen || item.recommendedHolding
  return item
}

const handleDailyRecommendations = async (url, env) => {
  const token = env.NOTION_TOKEN
  const databaseId = env.NOTION_DATABASE_ID
  if (!token || !databaseId) {
    return json({ error: 'NOTION_UNCONFIGURED', message: 'Notion token or database id is not configured.' }, 503)
  }

  try {
    const range = parseDateRange(url)
    const cacheKey = `${databaseId}:${isoDate(range.start)}:${isoDate(range.end)}`
    const cached = dailyRecommendationCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < DAILY_RECOMMENDATION_CACHE_TTL_MS) {
      return json(cached.payload)
    }

    const pages = await queryNotionPages(databaseId, token, range)
    const items = (await Promise.all(pages.map((page) => parseNotionPage(page, token)))).filter(Boolean)
    const payload = {
      source: 'notion',
      lastSyncedAt: new Date().toISOString(),
      cacheTtlSeconds: DAILY_RECOMMENDATION_CACHE_TTL_MS / 1000,
      items: items.sort((a, b) => a.date.localeCompare(b.date)),
    }
    dailyRecommendationCache.set(cacheKey, { createdAt: Date.now(), payload })
    return json(payload)
  } catch (error) {
    return json({ error: error.code ?? 'NOTION_REQUEST_FAILED', message: error.message }, error.status ?? 502)
  }
}

const yahooChartUrl = (symbol, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false&events=div%2Csplits`

const fetchYahooHistory = async (symbol, range = '20y') => {
  const response = await fetch(yahooChartUrl(symbol, range), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Yahoo request failed for ${symbol}: ${response.status}`)
  const payload = await response.json()
  const result = payload.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo returned no chart data for ${symbol}`)
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const records = []

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = quote.close?.[index]
    if (close == null) continue
    const open = quote.open?.[index] ?? close
    records.push({
      date: isoDate(new Date(timestamps[index] * 1000)),
      open: Number(open),
      close: Number(close),
    })
  }

  if (!records.length) throw new Error(`Yahoo returned no usable bars for ${symbol}`)
  return { symbol, frame: records }
}

const normalizeSymbol = (value, fallback) => {
  const symbol = String(value || fallback).trim().toUpperCase()
  return symbol === '' ? 'CASH' : symbol
}

const dateRangeForPayload = (payload) => {
  const startDate = parseIsoDate(payload.startDate)
  const endDate = parseIsoDate(payload.endDate) ?? new Date()
  if (!startDate) return '20y'
  const years = Math.max(2, Math.ceil((endDate - startDate) / (365.25 * DAY_MS)) + 1)
  return `${Math.min(years, 30)}y`
}

const collectRequiredSymbols = (payload) => {
  const symbols = new Set([normalizeSymbol(payload.benchmark, 'QQQ')])
  for (const strategy of payload.strategies ?? []) {
    symbols.add(normalizeSymbol(strategy.signalAsset, 'QQQ'))
    symbols.add(normalizeSymbol(strategy.riskAsset, 'QLD'))
    const fallback = normalizeSymbol(strategy.fallbackAsset, 'QQQ')
    if (fallback !== 'CASH') symbols.add(fallback)
  }
  return [...symbols].filter((symbol) => symbol !== 'CASH').sort()
}

const buildAlignedFrame = (assets, startDate, endDate) => {
  let dates = null
  const frameBySymbol = {}
  const audit = []

  for (const [symbol, asset] of Object.entries(assets)) {
    const rows = asset.frame.filter((row) => (!startDate || row.date >= isoDate(startDate)) && (!endDate || row.date <= isoDate(endDate)))
    audit.push({
      symbol,
      startDate: rows[0]?.date ?? null,
      endDate: rows.at(-1)?.date ?? null,
      rows: rows.length,
    })
    const byDate = new Map(rows.map((row) => [row.date, row]))
    frameBySymbol[symbol] = byDate
    const rowDates = new Set(rows.map((row) => row.date))
    dates = dates == null ? rowDates : new Set([...dates].filter((date) => rowDates.has(date)))
  }

  const sortedDates = [...(dates ?? [])].sort()
  if (!sortedDates.length) throw new Error('No overlapping data across selected assets')

  const rows = sortedDates.map((date) => {
    const row = { date }
    for (const symbol of Object.keys(assets)) {
      const assetRow = frameBySymbol[symbol].get(date)
      row[`${symbol}_open`] = assetRow.open
      row[`${symbol}_close`] = assetRow.close
    }
    return row
  })
  return { rows, audit }
}

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null)
const pct = (value) => (value == null ? null : Math.round(value * 10000) / 100)

const ema = (values, span) => {
  const alpha = 2 / (span + 1)
  const result = []
  let previous = null
  for (const value of values) {
    previous = previous == null ? value : alpha * value + (1 - alpha) * previous
    result.push(previous)
  }
  return result
}

const sma = (values, window) => values.map((_, index) => {
  if (index + 1 < window) return null
  const slice = values.slice(index + 1 - window, index + 1)
  return slice.reduce((sum, value) => sum + value, 0) / window
})

const movingAverage = (values, window, maType) => maType === 'ema' ? ema(values, window) : sma(values, window)

const computeMacd = (close, fast, slow, signal) => {
  const fastEma = ema(close, fast)
  const slowEma = ema(close, slow)
  const macd = fastEma.map((value, index) => value - slowEma[index])
  const signalLine = ema(macd, signal)
  const hist = macd.map((value, index) => value - signalLine[index])
  return { macd, signal: signalLine, hist }
}

const normalizeRuleGroup = (group, defaultType, defaultLogic = 'and') => {
  const source = group ?? {}
  if (Array.isArray(source.rules) && source.rules.length) {
    return { logic: String(source.logic ?? defaultLogic).toLowerCase(), rules: source.rules }
  }
  const rule = Object.fromEntries(Object.entries(source).filter(([key]) => !['logic', 'rules', 'requirePositiveHist'].includes(key)))
  rule.type = rule.type ?? defaultType
  const rules = [rule]
  if (source.requirePositiveHist) rules.push({ type: 'hist_positive' })
  return { logic: String(source.logic ?? defaultLogic).toLowerCase(), rules }
}

const entryMacdDefaults = (strategy) => {
  const entryGroup = normalizeRuleGroup(strategy.entry, 'macd_cross')
  const rule = entryGroup.rules.find((item) => item.type === 'macd_cross')
  return {
    fast: Number(rule?.fast ?? 12),
    slow: Number(rule?.slow ?? 26),
    signal: Number(rule?.signal ?? 9),
  }
}

const previousRolling = (values, index, window, reducer) => {
  const start = index - window
  if (start < 0) return null
  return reducer(values.slice(start, index))
}

const evaluateRule = (signalClose, rule, strategy, side) => {
  const ruleType = rule.type ?? (side === 'entry' ? 'macd_cross' : 'ma_break')
  const metadata = {}
  let label
  let value
  let signal

  if (ruleType === 'price_above_ma') {
    const window = Number(rule.window ?? 50)
    const maType = rule.maType ?? 'ema'
    const ma = movingAverage(signalClose, window, maType)
    signal = signalClose.map((close, index) => close > ma[index] && signalClose[index - 1] <= ma[index - 1])
    label = `Close crosses above ${maType.toUpperCase()}${window}`
    value = `${finite(signalClose.at(-1))} > ${finite(ma.at(-1))}`
  } else if (ruleType === 'price_breakout') {
    const window = Number(rule.window ?? 20)
    signal = signalClose.map((close, index) => {
      const high = previousRolling(signalClose, index, window, (values) => Math.max(...values))
      const prevHigh = previousRolling(signalClose, index - 1, window, (values) => Math.max(...values))
      return high != null && prevHigh != null && close > high && signalClose[index - 1] <= prevHigh
    })
    label = `Close > prior ${window}D high`
    value = `${finite(signalClose.at(-1))} > ${finite(previousRolling(signalClose, signalClose.length - 1, window, (values) => Math.max(...values)))}`
  } else if (ruleType === 'macd_cross_down') {
    const defaults = entryMacdDefaults(strategy)
    const fast = Number(rule.fast ?? defaults.fast)
    const slow = Number(rule.slow ?? defaults.slow)
    const signalPeriod = Number(rule.signal ?? defaults.signal)
    const macd = computeMacd(signalClose, fast, slow, signalPeriod)
    signal = macd.macd.map((item, index) => item < macd.signal[index] && macd.macd[index - 1] >= macd.signal[index - 1])
    label = `MACD(${fast},${slow},${signalPeriod}) death cross`
    value = 'cross down'
    Object.assign(metadata, { latestMacd: finite(macd.macd.at(-1)), latestSignal: finite(macd.signal.at(-1)), latestHist: finite(macd.hist.at(-1)) })
  } else if (ruleType === 'price_breakdown') {
    const window = Number(rule.window ?? 20)
    signal = signalClose.map((close, index) => {
      const low = previousRolling(signalClose, index, window, (values) => Math.min(...values))
      const prevLow = previousRolling(signalClose, index - 1, window, (values) => Math.min(...values))
      return low != null && prevLow != null && close < low && signalClose[index - 1] >= prevLow
    })
    label = `Close < prior ${window}D low`
    value = `${finite(signalClose.at(-1))} < ${finite(previousRolling(signalClose, signalClose.length - 1, window, (values) => Math.min(...values)))}`
  } else if (ruleType === 'hist_positive') {
    const defaults = entryMacdDefaults(strategy)
    const fast = Number(rule.fast ?? defaults.fast)
    const slow = Number(rule.slow ?? defaults.slow)
    const signalPeriod = Number(rule.signal ?? defaults.signal)
    const macd = computeMacd(signalClose, fast, slow, signalPeriod)
    signal = macd.hist.map((item) => item > 0)
    label = 'Hist > 0'
    value = finite(macd.hist.at(-1))
    Object.assign(metadata, {
      latestMacd: finite(macd.macd.at(-1)),
      latestSignal: finite(macd.signal.at(-1)),
      latestHist: finite(macd.hist.at(-1)),
      histPositive: Boolean(signal.at(-1)),
    })
  } else if (ruleType === 'macd_cross') {
    const fast = Number(rule.fast ?? 12)
    const slow = Number(rule.slow ?? 26)
    const signalPeriod = Number(rule.signal ?? 9)
    const macd = computeMacd(signalClose, fast, slow, signalPeriod)
    signal = macd.macd.map((item, index) => item > macd.signal[index] && macd.macd[index - 1] <= macd.signal[index - 1])
    label = `MACD(${fast},${slow},${signalPeriod}) golden cross`
    value = 'cross up'
    Object.assign(metadata, { latestMacd: finite(macd.macd.at(-1)), latestSignal: finite(macd.signal.at(-1)), latestHist: finite(macd.hist.at(-1)) })
  } else {
    const window = Number(rule.window ?? 15)
    const maType = rule.maType ?? 'ema'
    const ma = movingAverage(signalClose, window, maType)
    signal = signalClose.map((close, index) => ma[index] != null && close < ma[index])
    label = `Close < ${maType.toUpperCase()}${window}`
    value = `${finite(signalClose.at(-1))} < ${finite(ma.at(-1))}`
    Object.assign(metadata, { maLabel: `${maType.toUpperCase()}${window}`, latestMa: finite(ma.at(-1)) })
  }

  metadata.primaryLabel = label
  metadata.primaryPassed = Boolean(signal.at(-1))
  return { label, signal: signal.map(Boolean), value, metadata }
}

const buildRuleGroupSignal = (signalClose, strategy, side) => {
  const group = normalizeRuleGroup(strategy[side], side === 'entry' ? 'macd_cross' : 'ma_break')
  const logic = ['and', 'or'].includes(group.logic) ? group.logic : 'and'
  const conditions = group.rules.map((rule) => evaluateRule(signalClose, rule, strategy, side))
  const diagnostics = {
    logic: logic.toUpperCase(),
    requirePositiveHist: false,
    latestHist: null,
    histPositive: false,
    primaryPassed: false,
    primaryLabel: side === 'entry' ? 'Entry signal' : 'Exit signal',
  }

  let groupSignal = conditions[0]?.signal ?? signalClose.map(() => false)
  conditions.forEach((condition, index) => {
    Object.assign(diagnostics, Object.fromEntries(Object.entries(condition.metadata).filter(([, value]) => value != null)))
    if (index === 0) {
      diagnostics.primaryLabel = condition.metadata.primaryLabel ?? condition.label
      diagnostics.primaryPassed = Boolean(condition.signal.at(-1))
    }
    if (group.rules[index]?.type === 'hist_positive') diagnostics.requirePositiveHist = true
    if (index > 0) {
      groupSignal = groupSignal.map((value, itemIndex) => logic === 'or' ? value || condition.signal[itemIndex] : value && condition.signal[itemIndex])
    }
  })

  diagnostics.conditions = conditions.map((condition) => ({
    label: condition.label,
    value: condition.value,
    passed: Boolean(condition.signal.at(-1)),
  }))
  diagnostics[side === 'exit' ? 'exitPassed' : 'entryPassed'] = Boolean(groupSignal.at(-1))
  return { signal: groupSignal, diagnostics }
}

const capeFilterConfig = (strategy) => {
  const cape = strategy.riskFilter?.cape ?? {}
  const enabled = Boolean(cape.enabled)
  const maximum = Number(cape.max ?? 30)
  if (enabled && (!Number.isFinite(maximum) || maximum <= 0)) throw new Error('CAPE maximum must be a positive number')
  return { enabled, maximum }
}

const parseCapeHistoryHtml = (html) => {
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
  const records = []
  for (let index = 0; index < cells.length - 1; index += 1) {
    const date = new Date(cells[index])
    const value = cells[index + 1].match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*$/)
    if (!Number.isNaN(date.getTime()) && value) {
      records.push({ date: isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), cape: Number(value[1]) })
    }
  }
  const unique = new Map(records.map((record) => [record.date, record]))
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date))
  if (!sorted.length) throw new Error('CAPE source returned no usable monthly observations')
  return sorted
}

const fetchCapeHistory = async () => {
  if (capeCache && Date.now() - capeCache.createdAt < CAPE_CACHE_TTL_MS) return capeCache.records
  const response = await fetch(CAPE_HISTORY_URL, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } })
  if (!response.ok) throw new Error(`CAPE request failed: ${response.status}`)
  const records = parseCapeHistoryHtml(await response.text())
  capeCache = { createdAt: Date.now(), records }
  return records
}

const nextMonthStart = (dateString) => {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)))
}

const attachCapeHistory = (rows, capeHistory) => {
  const delayed = capeHistory.map((record) => ({ availableDate: nextMonthStart(record.date), cape: record.cape }))
    .sort((a, b) => a.availableDate.localeCompare(b.availableDate))
  let index = -1
  const aligned = rows.map((row) => {
    while (index + 1 < delayed.length && delayed[index + 1].availableDate <= row.date) index += 1
    return { ...row, cape: index >= 0 ? delayed[index].cape : null }
  })
  if (aligned.every((row) => row.cape == null)) throw new Error('CAPE data does not overlap the selected backtest range')
  return aligned
}

const assetGross = (rows, index, asset) => {
  if (asset === 'CASH') return 1
  const prevClose = rows[index - 1][`${asset}_close`]
  const close = rows[index][`${asset}_close`]
  return prevClose ? close / prevClose : 1
}

const switchGross = (rows, index, fromAsset, toAsset) => {
  if (fromAsset === toAsset) return assetGross(rows, index, fromAsset)
  const overnight = fromAsset === 'CASH' ? 1 : rows[index][`${fromAsset}_open`] / rows[index - 1][`${fromAsset}_close`]
  const intraday = toAsset === 'CASH' ? 1 : rows[index][`${toAsset}_close`] / rows[index][`${toAsset}_open`]
  return overnight * intraday
}

const summarizeReturns = (name, values, rows, switches) => {
  const returns = values.map((value, index) => index === 0 ? 0 : value / values[index - 1] - 1)
  const years = Math.max(values.length / 252, 1 / 252)
  const totalReturn = values.at(-1) - 1
  const cagr = values.at(-1) ** (1 / years) - 1
  let peak = values[0]
  const drawdowns = values.map((value) => {
    peak = Math.max(peak, value)
    return value / peak - 1
  })
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
  const vol = Math.sqrt(variance) * Math.sqrt(252)
  return {
    name,
    totalReturnPct: pct(totalReturn),
    cagrPct: pct(cagr),
    maxDrawdownPct: pct(Math.min(...drawdowns)),
    annualVolPct: pct(vol),
    sharpe: Number((vol ? (mean * 252) / vol : 0).toFixed(2)),
    switches,
  }
}

const buildBenchmark = (rows, benchmark) => {
  const firstClose = rows[0][`${benchmark}_close`]
  const values = rows.map((row) => row[`${benchmark}_close`] / firstClose)
  const summary = summarizeReturns(`${benchmark} Buy & Hold`, values, rows, 0)
  Object.assign(summary, { winVsBenchmark: null, currentHolding: benchmark, latestSignal: 'HOLD', rank: null })
  return {
    summary,
    equityCurve: rows.map((row, index) => ({ date: row.date, value: Number(values[index].toFixed(4)) })),
  }
}

const explainLatestSignal = (signalAsset, riskAsset, fallbackAsset, holding, pending, diagnostics) => {
  if (pending) return `Latest signal schedules a switch to ${pending} at the next open.`
  if (holding === riskAsset) {
    if (diagnostics.primaryPassed && diagnostics.requirePositiveHist && !diagnostics.histPositive) {
      return `${signalAsset} triggered ${diagnostics.primaryLabel}, but Hist is not positive, so the full exit condition is not met.`
    }
    return `The strategy remains in ${riskAsset}; the configured exit group is not fully triggered.`
  }
  return `The strategy remains in ${holding || fallbackAsset}; no entry signal is active on the latest completed bar.`
}

const runStrategy = (rows, strategy, index, benchmarkSummary) => {
  const name = (strategy.name || `Strategy ${index + 1}`).trim()
  const signalAsset = normalizeSymbol(strategy.signalAsset, 'QQQ')
  const riskAsset = normalizeSymbol(strategy.riskAsset, 'QLD')
  const fallbackAsset = normalizeSymbol(strategy.fallbackAsset, signalAsset)
  const signalClose = rows.map((row) => row[`${signalAsset}_close`])
  const entrySignal = buildRuleGroupSignal(signalClose, strategy, 'entry').signal
  const { signal: exitSignal, diagnostics } = buildRuleGroupSignal(signalClose, strategy, 'exit')
  const cape = capeFilterConfig(strategy)
  if (cape.enabled && !('cape' in rows[0])) throw new Error('CAPE data is required by the selected risk filter')
  const capePermitted = cape.enabled ? rows.map((row) => row.cape != null && row.cape <= cape.maximum) : rows.map(() => true)

  let held = fallbackAsset
  let pending = null
  let pendingReason = null
  let baseRiskOn = false
  const values = [1]
  const trades = []
  let switches = 0

  for (let idx = 1; idx < rows.length; idx += 1) {
    let gross
    if (pending == null) {
      gross = assetGross(rows, idx, held)
    } else {
      const old = held
      gross = switchGross(rows, idx, old, pending)
      held = pending
      pending = null
      switches += 1
      const reason = pendingReason || (held === riskAsset ? 'Entry signal' : 'Exit signal')
      pendingReason = null
      trades.push({
        signalDate: rows[idx - 1].date,
        executionDate: rows[idx].date,
        from: old,
        to: held,
        reason,
        equityAfterTrade: Number((values.at(-1) * gross).toFixed(4)),
      })
    }

    values.push(values.at(-1) * gross)

    if (!baseRiskOn && entrySignal[idx]) baseRiskOn = true
    else if (baseRiskOn && exitSignal[idx]) baseRiskOn = false

    const target = baseRiskOn && capePermitted[idx] ? riskAsset : fallbackAsset
    if (target !== held) {
      pending = target
      if (cape.enabled && baseRiskOn && target === fallbackAsset) pendingReason = 'CAPE risk filter'
      else if (cape.enabled && baseRiskOn && target === riskAsset && !entrySignal[idx]) pendingReason = 'CAPE risk filter cleared'
      else pendingReason = target === riskAsset ? 'Entry signal' : 'Exit signal'
    }
  }

  const summary = summarizeReturns(name, values, rows, switches)
  Object.assign(summary, {
    winVsBenchmark: (summary.cagrPct ?? -999) > (benchmarkSummary.cagrPct ?? -999),
    currentHolding: pending || held,
    latestSignal: pending ? 'SWITCH' : 'HOLD',
    rank: null,
  })
  const latestConditions = [...diagnostics.conditions, { label: 'Full exit signal', value: diagnostics.logic, passed: Boolean(exitSignal.at(-1)) }]
  if (cape.enabled) {
    latestConditions.push({
      label: `CAPE <= ${cape.maximum}`,
      value: rows.at(-1).cape == null ? null : Number(rows.at(-1).cape.toFixed(2)),
      passed: Boolean(capePermitted.at(-1)),
    })
  }

  return {
    id: strategy.id || `strategy-${index + 1}`,
    summary,
    equityCurve: rows.map((row, itemIndex) => ({ date: row.date, value: Number(values[itemIndex].toFixed(4)) })),
    trades: trades.slice(-100),
    latestSignal: {
      holding: pending || held,
      action: pending ? 'SWITCH' : 'HOLD',
      conditions: latestConditions,
      explanation: explainLatestSignal(signalAsset, riskAsset, fallbackAsset, pending || held, pending, diagnostics),
    },
  }
}

const handleBacktests = async (request) => {
  try {
    const payload = await request.json()
    const strategies = payload.strategies ?? []
    if (!strategies.length) return json({ error: 'At least one strategy is required' }, 400)
    if (strategies.length > MAX_STRATEGIES) return json({ error: `At most ${MAX_STRATEGIES} strategies can be compared` }, 400)

    const startDate = parseIsoDate(payload.startDate)
    const endDate = parseIsoDate(payload.endDate)
    const benchmark = normalizeSymbol(payload.benchmark, 'QQQ')
    const range = dateRangeForPayload(payload)
    const assets = {}
    await Promise.all(collectRequiredSymbols(payload).map(async (symbol) => {
      assets[symbol] = await fetchYahooHistory(symbol, range)
    }))
    const aligned = buildAlignedFrame(assets, startDate, endDate)
    let rows = aligned.rows
    const audit = aligned.audit
    if (strategies.some((strategy) => Boolean(strategy.riskFilter?.cape?.enabled))) {
      const capeHistory = await fetchCapeHistory()
      rows = attachCapeHistory(rows, capeHistory)
      audit.push({
        symbol: 'CAPE',
        startDate: capeHistory[0].date,
        endDate: capeHistory.at(-1).date,
        rows: capeHistory.length,
      })
    }
    if (rows.length < 80) return json({ error: 'Aligned data has fewer than 80 daily bars', dataAudit: audit }, 400)

    const benchmarkResult = buildBenchmark(rows, benchmark)
    const results = strategies.map((strategy, itemIndex) => runStrategy(rows, strategy, itemIndex, benchmarkResult.summary))
    const ranked = [...results].sort((a, b) => (b.summary.cagrPct ?? -999) - (a.summary.cagrPct ?? -999))
    ranked.forEach((item, rankIndex) => {
      item.summary.rank = rankIndex + 1
    })
    return json({
      generatedAt: new Date().toISOString(),
      alignedRange: { startDate: rows[0].date, endDate: rows.at(-1).date, rows: rows.length },
      dataAudit: audit,
      benchmark: benchmarkResult,
      strategies: results,
    })
  } catch (error) {
    return json({ error: error.message }, 500)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return json({})

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'backtest-backend', runtime: 'sites-worker' })
    }

    if (url.pathname === '/api/daily-recommendations' && request.method === 'GET') {
      return handleDailyRecommendations(url, env)
    }

    if (url.pathname === '/api/backtests' && request.method === 'POST') {
      return handleBacktests(request)
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }

    const asset = serveAsset(url.pathname === '/' ? '/index.html' : url.pathname)

    if (asset) {
      return request.method === 'HEAD' ? new Response(null, asset) : asset
    }

    const fallback = serveAsset('/index.html')
    return request.method === 'HEAD' ? new Response(null, fallback) : fallback
  },
}
