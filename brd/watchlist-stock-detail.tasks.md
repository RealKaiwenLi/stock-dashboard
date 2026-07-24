# 任务清单：Watchlist 与个股详情页

## 1. 来源

- BRD: `./brd/watchlist-stock-detail.md`
- 技术方案: `./brd/watchlist-stock-detail.tech.md`
- 执行者: TDD agent
- 语言: 中文

## 2. 执行原则

- 按顺序执行，除非任务标记 `[P]`。
- 先 mock，暂不接真实 Massive。
- 优先 TDD：先写 focused test，再实现最小代码。
- 新依赖安装前必须获得用户批准。
- 每完成一组任务后运行相关测试；收尾运行 `npm test`、`npm run build`、`npm run lint`。

## 3. 依赖安装

### T0. 请求用户批准新增依赖

目标：

- 获取用户批准安装 routing 和 chart library。

操作：

- 请求批准运行：
  - `npm install react-router-dom lightweight-charts`

验收：

- 用户批准后再安装。
- 若用户不批准，继续执行 mock data/storage/search/indicator/page shell，并让 `StockChart` 使用占位实现。

## 4. 数据与纯函数

### T1. 创建 mock stock 数据

依赖：无

测试先行：

- 新增 `src/data/mockStocks.test.js`
- 覆盖：
  - mock directory 包含 `AAPL`、`MSFT`、`NVDA`、`TSLA`、`AMZN`、`META`、`GOOGL`、`SPY`、`QQQ`、`DIA`
  - 每个 symbol 有 quote
  - 每个 symbol 能返回足够计算 1Y 日线指标的 OHLCV bars
  - bar 字段包含 `time/open/high/low/close/volume`

实现：

- 新增 `src/data/mockStocks.js`
- 提供：
  - `mockStockDirectory`
  - `mockStockQuotes`
  - `getMockStockBars(symbol, range)`
  - deterministic bar generator，避免测试 flaky

验收：

- `npm test -- src/data/mockStocks.test.js` 通过。

### T2. 实现 watchlist storage adapter

依赖：T1 可并行，但建议先做

测试先行：

- 新增 `src/services/watchlistStorage.test.js`
- 覆盖：
  - 空 storage 返回空数组
  - corrupt JSON 返回空数组
  - 添加 item 后可读取
  - 重复 symbol 不重复添加
  - symbol normalize 为大写
  - 删除 symbol 后不再返回
  - storage 抛错时不导致调用方崩溃

实现：

- 新增 `src/services/watchlistStorage.js`
- 使用 key `stock-dashboard.watchlist.v1`
- 导出：
  - `readWatchlist(storage)`
  - `writeWatchlist(items, storage)`
  - `addWatchlistItem(item, storage)`
  - `removeWatchlistItem(symbol, storage)`

验收：

- `npm test -- src/services/watchlistStorage.test.js` 通过。

### T3. 实现 mock stock search service

依赖：T1

测试先行：

- 新增 `src/services/stockSearchService.test.js`
- 覆盖：
  - 搜索 `AAPL` 返回 Apple
  - 搜索 `apple` 返回 Apple
  - 搜索空字符串不返回结果
  - 搜索未知 query 返回空结果
  - limit 默认为 20

实现：

- 新增 `src/services/stockSearchService.js`
- P0 mock 搜索 `mockStockDirectory`
- 不引入 Fuse.js
- 暴露 future Massive adapter seam，例如 `searchStocks(query, options = {})`

验收：

- `npm test -- src/services/stockSearchService.test.js` 通过。

### T4. 实现 mock quote service 和 mock stream

依赖：T1

测试先行：

- 新增 `src/services/stockQuoteService.test.js`
- 使用 fake timers 覆盖：
  - `getStockQuotes(['AAPL'])` 返回 quote map
  - unknown symbol 返回缺失/不可用状态
  - `createMockQuoteStream` 会定时调用 `onUpdate`
  - `close()` 后不再更新

实现：

- 新增 `src/services/stockQuoteService.js`
- 导出：
  - `getStockQuotes(symbols)`
  - `createMockQuoteStream({ symbols, onUpdate, intervalMs, setIntervalFn, clearIntervalFn })`
- mock update 小幅改变 price/change/changePercent/lastUpdated
- data mode 使用 `mock-live`

验收：

- `npm test -- src/services/stockQuoteService.test.js` 通过。

### T5. 实现 mock bars service

依赖：T1

测试先行：

- 新增 `src/services/stockBarsService.test.js`
- 覆盖：
  - `getStockBars('AAPL', '1M')` 返回约 1 个月数据
  - `getStockBars('AAPL', '6M')` 返回更多数据
  - `getStockBars('AAPL', '1Y')` 返回更多数据
  - unknown symbol 返回空或 not found 状态

实现：

- 新增 `src/services/stockBarsService.js`
- 支持 range: `1M`、`6M`、`1Y`
- 暂不调用 Massive REST

验收：

- `npm test -- src/services/stockBarsService.test.js` 通过。

### T6. 实现技术指标纯函数

依赖：T1

测试先行：

- 新增 `src/utils/technicalIndicators.test.js`
- 覆盖：
  - `calculateBollingerBands` 数据不足返回空或 insufficient 状态
  - Bollinger middle 等于 20 日 SMA
  - MACD 返回 macd/signal/histogram 字段
  - KDJ 返回 k/d/j 字段
  - KDJ 中 `j = 3k - 2d`
  - 所有指标输出可和 bar time 对齐

实现：

- 新增 `src/utils/technicalIndicators.js`
- 实现：
  - `calculateSMA`
  - `calculateEMA`
  - `calculateStandardDeviation`
  - `calculateMACD`
  - `calculateBollingerBands`
  - `calculateKDJ`
  - `buildIndicatorsForBars`

验收：

- `npm test -- src/utils/technicalIndicators.test.js` 通过。

## 5. Hooks

### T7. 实现 useWatchlist hook

依赖：T2

测试先行：

- 新增 `src/hooks/useWatchlist.test.jsx`
- 覆盖：
  - 初始从 storage 读取
  - add 后 state 更新且写 storage
  - remove 后 state 更新且写 storage
  - duplicate add 不重复

实现：

- 新增 `src/hooks/useWatchlist.js`
- 导出 `useWatchlist({ storage } = {})`

验收：

- `npm test -- src/hooks/useWatchlist.test.jsx` 通过。

### T8. 实现 useStockQuotes hook

依赖：T4

测试先行：

- 新增 `src/hooks/useStockQuotes.test.jsx`
- 覆盖：
  - symbols 为空不启动 stream
  - mount 后加载初始 quotes
  - stream update 后 quote 更新
  - unmount 后 close stream
  - 暴露 `connectionStatus`

实现：

- 新增 `src/hooks/useStockQuotes.js`
- 使用 `getStockQuotes` 和 `createMockQuoteStream`

验收：

- `npm test -- src/hooks/useStockQuotes.test.jsx` 通过。

## 6. Routing 与 App Shell

### T9. 引入 routing

依赖：T0

测试先行：

- 修改/新增 `src/App.test.jsx`
- 覆盖：
  - `/` 渲染首页
  - `/watchlist` 渲染 Watchlist 页面标题/空状态
  - `/stocks/AAPL` 渲染 AAPL 详情页基本 shell

实现：

- 修改 `src/App.jsx`
- 使用 `BrowserRouter` / route composition
- 保留 `DashboardHome`
- 新增临时页面 shell：
  - `src/pages/WatchlistPage.jsx`
  - `src/pages/StockDetailPage.jsx`

验收：

- `npm test -- src/App.test.jsx` 通过。

## 7. Watchlist 页面

### T10. 实现搜索组件

依赖：T3

测试先行：

- 新增组件测试或放入 `src/pages/WatchlistPage.test.jsx`
- 覆盖：
  - 输入 `AAPL` 后显示搜索结果
  - empty query 不显示结果
  - unknown query 显示未找到

实现：

- 新增：
  - `src/components/StockSearch.jsx`
  - `src/components/StockSearchResults.jsx`
- Watchlist 页面接入搜索
- P0 debounce 可用小 hook 或 `setTimeout`，测试中使用 fake timers；如果复杂，先实现即时搜索并在后续任务补 debounce

验收：

- 搜索 `AAPL` 可见 Apple 结果。

### T11. 实现 watchlist card grid 和添加收藏

依赖：T7、T8、T10

测试先行：

- `src/pages/WatchlistPage.test.jsx`
- 覆盖：
  - 初始为空显示空状态
  - 搜索结果点击添加后出现 card
  - card 展示 ticker/name/price/change/data mode
  - 已添加结果按钮显示已添加或 disabled

实现：

- 新增 `src/components/WatchlistCard.jsx`
- Watchlist 页面展示 card grid
- 接入 `useWatchlist` 和 `useStockQuotes`

验收：

- 添加 `AAPL` 后 card 出现。

### T12. 实现删除收藏且不跳转

依赖：T11

测试先行：

- 覆盖：
  - 点击 delete 删除 card
  - delete 不调用 navigate
  - storage 同步删除

实现：

- `WatchlistCard` 删除按钮 `event.stopPropagation()` 或使用清晰的 button/link 分离结构
- 删除按钮带 `aria-label`

验收：

- 删除行为正确，不误跳详情页。

### T13. 实现 card 点击跳转详情页

依赖：T9、T11

测试先行：

- 覆盖：
  - 点击 card 主体导航到 `/stocks/AAPL`

实现：

- `WatchlistCard` 主体使用 `Link` 或 card action area
- URL 使用 `/stocks/${symbol}`

验收：

- 点击 card 进入详情页。

## 8. 个股详情页

### T14. 实现详情页数据加载与 header

依赖：T5、T8、T9

测试先行：

- 新增 `src/pages/StockDetailPage.test.jsx`
- 覆盖：
  - `/stocks/AAPL` 显示 ticker/name/price/change/changePercent
  - unknown ticker 显示未找到
  - mock stream update 后 header price 更新
  - 展示 `mock live` / “模拟实时”

实现：

- 新增 `src/components/StockPriceHeader.jsx`
- `StockDetailPage` 读取 `ticker` route param 并 normalize 大写
- 加载 quote + bars

验收：

- AAPL 详情 header 可见并更新。

### T15. 实现 range control

依赖：T5、T14

测试先行：

- 覆盖：
  - 默认 range 为 `1M` 或 `6M`，按技术方案最终选择
  - 点击 `6M` 后 bars 数量变化或 service 参数变化
  - 点击 `1Y` 后指标重新计算

实现：

- 新增 `src/components/RangeControl.jsx`
- 支持 `1M`、`6M`、`1Y`

验收：

- range 切换驱动详情页数据和指标更新。

### T16. 实现 indicator toggles

依赖：T6、T14

测试先行：

- 覆盖：
  - 默认开启 Bollinger、MACD、KDJ
  - 点击 toggle 可隐藏/显示对应指标
  - 数据不足时显示不足提示

实现：

- 新增 `src/components/IndicatorToggleGroup.jsx`
- `StockDetailPage` 管理 enabled indicators state

验收：

- 指标开关状态正确。

### T17. 实现 StockChart 封装

依赖：T0、T6、T14、T16

测试先行：

- 新增 `src/components/StockChart.test.jsx`
- 覆盖：
  - bars 为空显示暂无图表数据
  - bars 存在显示 chart container
  - enabled indicators legend 可见
  - unmount 时清理 chart instance

实现：

- 新增 `src/components/StockChart.jsx`
- 如果 `lightweight-charts` 已安装：
  - 创建 candlestick series
  - 创建 volume histogram
  - Bollinger 用 line series
  - MACD/KDJ 暂可先用独立 legend + simplified pane，若 pane API 集成复杂则保留清晰 TODO 并展示 indicator summary
- 如果未安装：
  - 提供占位 chart container，显示 K 线/volume/indicator legends，不做真实 chart

验收：

- 详情页有稳定图表区域，不崩溃。

### T18. 接入详情页图表、免责声明与状态

依赖：T15、T16、T17

测试先行：

- 覆盖：
  - 详情页展示 chart container
  - 展示 MACD/KDJ/Bollinger 文案
  - 展示“不构成投资建议”
  - unknown/empty bars 状态不崩溃

实现：

- 完成 `StockDetailPage` 布局
- 加入 loading/error/empty/not found 状态

验收：

- `/stocks/AAPL` 完整可用。

## 9. 导航与文案

### T19. 更新 TopBar 导航

依赖：T9

测试先行：

- 覆盖：
  - TopBar 有 Home 和 Watchlist 导航
  - 点击 Watchlist 到 `/watchlist`
  - 当前页面 active 状态可访问表达

实现：

- 修改 `src/components/TopBar.jsx`
- 或新增 `src/components/AppTopBar.jsx`，避免破坏 dashboard home
- 保留语言切换和数据状态

验收：

- 首页和 watchlist 都能通过导航访问。

### T20. 增加 watchlist/stock detail 文案

依赖：T10-T18 可并行

测试先行：

- 更新/新增 i18n 测试
- 覆盖关键文案存在：
  - Watchlist
  - 搜索
  - 添加
  - 删除
  - 模拟实时
  - 数据不足
  - 不构成投资建议

实现：

- 可以在 `src/i18n/translations.js` 扩展，也可以新增 `src/i18n/stockTranslations.js`
- 保持中文默认，英文可基本覆盖

验收：

- 文案测试通过，UI 不出现裸 key。

## 10. 样式与响应式

### T21. 实现页面样式

依赖：T11、T18

测试：

- 不做像素测试；通过组件测试确认 class/结构。

实现：

- 修改 `src/App.css`
- Watchlist card grid:
  - desktop 3-4 列
  - tablet 2 列
  - mobile 1 列
- 详情页 chart 区域有稳定高度和响应式约束
- 删除按钮、indicator toggles、range controls 使用清晰控件

验收：

- 页面无明显重叠，card/grid/chart 有稳定尺寸。

## 11. 收尾验证

### T22. 全量测试

依赖：T1-T21

操作：

- 运行 `npm test`

验收：

- 所有测试通过。

### T23. Build

依赖：T22

操作：

- 运行 `npm run build`

验收：

- build 成功。

### T24. Lint

依赖：T22

操作：

- 运行 `npm run lint`

验收：

- lint 通过。

### T25. 手动验证说明

依赖：T23、T24

操作：

- 不主动启动 `npm run dev`，除非用户要求。
- 在最终回复中说明：
  - 已实现 mock-first watchlist 和 stock detail
  - Massive 尚未接入
  - 如果用户要试用，可请求启动 dev server

验收：

- 最终回复包含变更摘要、测试/build/lint 结果、剩余 Massive 接入说明。

## 12. 后续 Massive 接入任务，不属于当前 mock P0

### F1. Massive ticker search adapter

- 将 `stockSearchService` mock provider 替换/扩展为 Massive REST provider。
- 保留 mock fallback。

### F2. Massive custom bars adapter

- 将 `stockBarsService` 接入 `/v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}`。
- 处理 API key、rate limit、empty bars。

### F3. Massive WebSocket quote provider

- 扩展现有 `createMassiveMarketSocket`，支持动态 symbols。
- Watchlist 和详情页使用真实 stream。
- UI 根据 plan 显示 live/delayed。

### F4. 最新 candle 实时更新

- 用 WebSocket aggregate 更新最新一根 candle。
- 重新计算当前 range 末尾指标。

## 13. 推荐执行切片

第一批：

- T0-T8：数据、storage、hooks 和指标。

第二批：

- T9-T13：routing 和 watchlist。

第三批：

- T14-T18：详情页和图表。

第四批：

- T19-T25：导航、文案、样式、验证。
