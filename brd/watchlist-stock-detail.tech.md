# 技术方案：Watchlist 与个股详情页

## 1. 来源

- BRD: `./brd/watchlist-stock-detail.md`
- 任务清单: `./brd/watchlist-stock-detail.tasks.md`
- 创建者: technical-planner
- 语言: 中文

## 2. 当前约束与决策

- 用户确认 Massive 还没弄好，因此 MVP 实现必须先使用 mock 数据跑通完整交互。
- 最终 URL 已定：
  - Watchlist: `/watchlist`
  - 个股详情: `/stocks/:ticker`，例如 `/stocks/AAPL`
- Watchlist 收藏以 card grid 展示，点击 card 主体跳转详情，删除按钮不触发跳转。
- 搜索 P0 不引入搜索库；mock 阶段在本地 mock symbols 中做简单 contains 匹配，Massive 接入后改为调用 `GET /v3/reference/tickers?market=stocks&active=true&search=<query>&limit=20`。
- 个股详情图表推荐使用 `lightweight-charts`。
- 技术指标推荐先在项目内实现 MACD、KDJ、Bollinger Bands 纯函数，避免为了 3 个指标立即引入较老的 `technicalindicators` 依赖。
- Massive WebSocket P0 先用 mock realtime ticker simulator 模拟开盘更新；后续替换为真实 Massive Stocks WebSocket。

## 3. 摘要

- 引入前端 routing，新增 `/watchlist` 和 `/stocks/:ticker` 两个页面。
- 新增 mock stock universe、mock quotes、mock OHLCV bars 和 mock realtime quote simulator。
- Watchlist 页面通过本地 search service 搜索 mock symbols，并通过 `localStorage` 保存收藏。
- Watchlist card quote 和个股详情 header quote 使用同一个 `useStockQuotes` hook；mock 阶段定时产生轻微价格变化，模拟 WebSocket 更新。
- 个股详情页使用 mock OHLCV bars 渲染 K 线、成交量、MACD、KDJ、Bollinger Bands。
- `lightweight-charts` 作为图表库需要用户批准安装；若用户暂不批准，TDD agent 应先实现数据、路由、watchlist 和指标测试，图表组件用可测试占位层封装。

## 4. 技术上下文

- 项目类型: Vite React SPA
- 框架: React 19
- 测试: Vitest + React Testing Library + jsdom
- 当前入口: `src/App.jsx` 直接渲染 `DashboardHome`
- 当前页面: `src/pages/DashboardHome.jsx`
- 当前 WebSocket service: `src/services/massiveWebSocket.js`
- 当前 mock data: `src/data/mockMarketData.js`
- 当前样式: `src/App.css` + `src/index.css`
- 当前无 routing library

## 5. 依赖建议

| Library | 用途 | 是否已安装 | Planner 建议 | 是否需要用户确认 |
| --- | --- | --- | --- | --- |
| `react-router-dom` | 支持 `/watchlist`、`/stocks/:ticker`、导航链接和测试友好的 routing | no | 推荐安装 | yes |
| `lightweight-charts` | 金融 K 线、bar、line、histogram、成交量、指标 pane | no | 推荐安装 | yes |
| `technicalindicators` | 指标计算 | no | 暂不推荐 P0 安装，先自研 3 个纯函数 | yes，如果后续改用 |
| `Fuse.js` | 本地 fuzzy search | no | 不推荐 P0 安装 | yes，如果后续本地全量搜索 |

依赖决策：

- `react-router-dom` 推荐原因：项目已经要支持可分享 URL，手写 history/hash routing 会让页面测试和后续扩展更脆。
- `lightweight-charts` 推荐原因：用户明确要柱状图、线、K 线和指标展示；自研 SVG 会把复杂度转移到 TDD agent，且体验不如专业金融图表库。
- 指标计算先自研：MACD、KDJ、Bollinger Bands 公式可控，单元测试覆盖即可；避免额外依赖带来的 bundle 和维护风险。

## 6. 架构方案

### 6.1 Routing

- 修改 `src/App.jsx` 为 app shell：
  - `/` 渲染 `DashboardHome`
  - `/watchlist` 渲染 `WatchlistPage`
  - `/stocks/:ticker` 渲染 `StockDetailPage`
  - unknown path 可重定向到 `/` 或展示简单 not found
- TopBar 需要支持导航状态：
  - Home
  - Watchlist
  - 当前详情页不需要单独 nav item，但需要保留返回 watchlist 的入口

### 6.2 Mock-first Data Provider

新增 data/service 层：

- `src/data/mockStocks.js`
  - `mockStockDirectory`: 至少包含 `AAPL`、`MSFT`、`NVDA`、`TSLA`、`AMZN`、`META`、`GOOGL`、`SPY`、`QQQ`、`DIA`
  - `mockStockQuotes`: 当前 price/change/changePercent/lastUpdated/dataMode
  - `mockStockBarsBySymbol`: 每个 symbol 至少 260 条日线 OHLCV，或用 deterministic generator 生成
- `src/services/stockSearchService.js`
  - P0 mock: `searchStocks(query)` 从 `mockStockDirectory` 中按 ticker/name contains 搜索
  - future Massive: 保留 adapter seam，后续切换到 REST API
- `src/services/stockQuoteService.js`
  - P0 mock: `getStockQuotes(symbols)` 返回 mock quote map
  - P0 mock realtime: `createMockQuoteStream({ symbols, onUpdate })`
  - future Massive: 与现有 `createMassiveMarketSocket` 合并或扩展
- `src/services/stockBarsService.js`
  - P0 mock: `getStockBars(symbol, range)` 返回 mock OHLCV bars
  - future Massive: 通过 Custom Bars OHLC endpoint 获取 bars

### 6.3 Watchlist Storage

新增：

- `src/services/watchlistStorage.js`
  - `readWatchlist(storage = localStorage)`
  - `writeWatchlist(items, storage = localStorage)`
  - `addWatchlistItem(item, storage)`
  - `removeWatchlistItem(symbol, storage)`
  - 对 corrupt JSON、安全空值、重复 symbol、大小写 normalize 做保护
- `src/hooks/useWatchlist.js`
  - 管理 watchlist state
  - 添加、删除、持久化
  - storage unavailable 时降级为内存 state 并暴露 warning

存储 key:

- `stock-dashboard.watchlist.v1`

Watchlist item:

```js
{
  symbol: 'AAPL',
  name: 'Apple Inc.',
  primaryExchange: 'XNAS',
  type: 'CS',
  addedAt: '2026-06-05T00:00:00.000Z',
  sortOrder: 0
}
```

### 6.4 Quote Hook

新增：

- `src/hooks/useStockQuotes.js`
  - 输入 `symbols`
  - 初始加载 `getStockQuotes(symbols)`
  - mock 阶段启动 `createMockQuoteStream`
  - 返回 `{ quotesBySymbol, connectionStatus, dataMode, lastUpdated }`
  - symbol 为空时不启动 stream
  - cleanup 时关闭 stream

P0 mock 行为：

- 每 2 秒更新一次订阅 symbol 的价格，幅度控制在当前价 +/- 0.15%。
- `dataMode` 显示 `mock live` 或本地化为“模拟实时”。
- 不声称真实 live market data。

Future Massive 行为：

- quote/header 订阅当前 watchlist symbols 或详情 symbol。
- 如果 plan delayed，则 `dataMode = delayed`；如果 real-time，则 `dataMode = live`。
- 断开时保留最后 quote 并显示 reconnecting/disconnected。

### 6.5 技术指标

新增：

- `src/utils/technicalIndicators.js`

函数：

- `calculateEMA(values, period)`
- `calculateMACD(closes, { fast = 12, slow = 26, signal = 9 })`
- `calculateBollingerBands(closes, { period = 20, standardDeviations = 2 })`
- `calculateKDJ(bars, { period = 9, kSmoothing = 3, dSmoothing = 3 })`
- `alignIndicatorToBars(bars, indicatorValues)`

默认公式：

- MACD:
  - `macd = EMA(close, 12) - EMA(close, 26)`
  - `signal = EMA(macd, 9)`
  - `histogram = macd - signal`
- Bollinger Bands:
  - `middle = SMA(close, 20)`
  - `upper = middle + 2 * stdDev`
  - `lower = middle - 2 * stdDev`
- KDJ:
  - `RSV = (close - lowestLow(n)) / (highestHigh(n) - lowestLow(n)) * 100`
  - `K = SMA/EMA-like smoothing of RSV`
  - `D = smoothing of K`
  - `J = 3 * K - 2 * D`

数据不足：

- 返回空数组或带 `insufficientData` flag，由 UI 展示“数据不足以计算该指标”。

### 6.6 图表组件

新增：

- `src/components/StockChart.jsx`

职责：

- 输入 `bars`、`indicators`、`enabledIndicators`、`range`
- 使用 `lightweight-charts` 创建图表
- 主图：
  - candlestick series
  - Bollinger upper/middle/lower line series
- 成交量：
  - histogram series
- MACD：
  - histogram series + macd line + signal line
- KDJ：
  - K/D/J line series

实现建议：

- 如果 `lightweight-charts` 安装未完成，TDD agent 先创建封装组件和测试占位，避免阻塞 storage/routing/指标任务。
- 图表 DOM 测试不要做像素级断言；单元测试覆盖数据转换，组件测试只确认容器、legend、状态和 series setup 被调用。

### 6.7 页面组件

新增：

- `src/pages/WatchlistPage.jsx`
  - search input
  - results list
  - watchlist card grid
  - empty/loading/error states
- `src/pages/StockDetailPage.jsx`
  - route param ticker
  - header quote
  - range segmented control
  - indicator toggles
  - chart
  - disclaimer
- `src/components/StockSearch.jsx`
- `src/components/StockSearchResults.jsx`
- `src/components/WatchlistCard.jsx`
- `src/components/StockPriceHeader.jsx`
- `src/components/RangeControl.jsx`
- `src/components/IndicatorToggleGroup.jsx`

### 6.8 样式

- 延续 dashboard app 风格，不做 landing page。
- Watchlist 使用响应式 grid：
  - desktop: 3-4 columns
  - tablet: 2 columns
  - mobile: 1 column
- Card radius 不超过 8px。
- 删除操作用图标按钮，带 accessible label。
- 详情页主体验以 chart 为中心，不把 chart 放进过度装饰的大卡套卡。

## 7. 文件计划

| 文件路径 | 变更类型 | 用途 |
| --- | --- | --- |
| `package.json` | modify | 安装 `react-router-dom`、`lightweight-charts` 后更新依赖 |
| `src/App.jsx` | modify | 引入 routing 和页面映射 |
| `src/App.test.jsx` | modify | 覆盖导航和基础 route |
| `src/pages/WatchlistPage.jsx` | create | Watchlist 页面 |
| `src/pages/StockDetailPage.jsx` | create | 个股详情页 |
| `src/data/mockStocks.js` | create | mock symbol、quote、bars |
| `src/data/mockStocks.test.js` | create | mock 数据 shape 和 generator 测试 |
| `src/services/watchlistStorage.js` | create | localStorage adapter |
| `src/services/watchlistStorage.test.js` | create | storage 行为测试 |
| `src/services/stockSearchService.js` | create | mock search，future Massive adapter seam |
| `src/services/stockSearchService.test.js` | create | 搜索匹配/空结果测试 |
| `src/services/stockQuoteService.js` | create | mock quote + mock stream |
| `src/services/stockQuoteService.test.js` | create | quote 和 stream 测试 |
| `src/services/stockBarsService.js` | create | mock OHLCV bars |
| `src/services/stockBarsService.test.js` | create | range 和 symbol 测试 |
| `src/hooks/useWatchlist.js` | create | watchlist state hook |
| `src/hooks/useWatchlist.test.jsx` | create | add/remove/persist 测试 |
| `src/hooks/useStockQuotes.js` | create | quote stream hook |
| `src/hooks/useStockQuotes.test.jsx` | create | initial quote/update/cleanup 测试 |
| `src/utils/technicalIndicators.js` | create | MACD/KDJ/Bollinger 计算 |
| `src/utils/technicalIndicators.test.js` | create | 指标公式与不足数据测试 |
| `src/components/StockSearch.jsx` | create | 搜索输入 |
| `src/components/StockSearchResults.jsx` | create | 搜索结果 |
| `src/components/WatchlistCard.jsx` | create | 可点击 card |
| `src/components/StockPriceHeader.jsx` | create | 详情页价格头部 |
| `src/components/RangeControl.jsx` | create | 时间范围控制 |
| `src/components/IndicatorToggleGroup.jsx` | create | 指标开关 |
| `src/components/StockChart.jsx` | create | 图表封装 |
| `src/App.css` | modify | 页面、card、chart、controls 样式 |
| `src/i18n/dashboardCopy.js` | modify or split | 增加 watchlist/stock detail 文案，或拆 `stockCopy.js` |

## 8. 测试策略

优先 TDD 顺序：

1. storage 单元测试。
2. mock search / quote / bars service 测试。
3. technical indicators 单元测试。
4. hooks 测试。
5. route/page 组件测试。
6. chart adapter 测试。

核心测试：

- Watchlist 初始为空时显示空状态。
- 搜索 `AAPL` 展示 Apple 结果。
- 添加 `AAPL` 后出现 watchlist card。
- 刷新/重新 mount 后 `AAPL` 从 localStorage 恢复。
- 删除按钮删除 card，且不触发 navigate。
- 点击 card 主体导航到 `/stocks/AAPL`。
- `/stocks/AAPL` 显示 header、价格、range control、indicator toggles、chart container、免责声明。
- 无效 ticker 显示 not found。
- WebSocket/mock stream update 后 quote 文案更新。
- MACD/KDJ/Bollinger 在数据不足时返回不足状态，UI 展示提示。

验证命令：

- `npm test`
- `npm run build`
- `npm run lint`

## 9. 风险与待确认

风险：

- `lightweight-charts` 在 jsdom 下不能真实渲染 canvas，需要 mock library 或把 chart setup 抽象成 adapter 测试。
- 新增 routing 会影响现有首页测试，需要保留 `/` 首页行为。
- Mock realtime 必须明确显示“模拟”，避免误认为真实行情。
- 未来 Massive WebSocket 和 REST 接入时，需要处理 API key 暴露问题。
- 如果不安装 `lightweight-charts`，个股详情图表只能先做占位，无法达到最终视觉。

已由用户确认：

- Massive 还没弄好，先用 mock。
- Watchlist URL 为 `/watchlist`。
- 个股详情 URL 为 `/stocks/:ticker`。
- Watchlist 用 card grid，点击 card 跳转详情。

`NEEDS CLARIFICATION`：

- 是否批准 TDD agent 安装 `react-router-dom` 和 `lightweight-charts`？
- Mock watchlist 是否默认预置 `AAPL`、`NVDA`、`TSLA`，还是初始为空？Planner 建议初始为空，但搜索区展示 mock 热门建议。
- P0 图表最新一根 K 线是否需要随 mock stream 更新？Planner 建议 P0 只实时更新 header/watchlist quote，P1 再更新 candle。

## 10. 交接给 TDD Agent

- 先读：
  - `docs/project-context.md`
  - `AGENTS.md`
  - `brd/watchlist-stock-detail.md`
  - `brd/watchlist-stock-detail.tech.md`
  - `brd/watchlist-stock-detail.tasks.md`
- 先请求用户批准安装：
  - `npm install react-router-dom lightweight-charts`
- 如果用户暂不批准依赖：
  - 继续做 mock data、storage、search、indicators、页面结构。
  - `StockChart` 先用占位组件封装，保留 props API。
- 不要接真实 Massive。
- 不要把 API key 写入代码。
- 不要实现 portfolio、交易、账户、云同步。
