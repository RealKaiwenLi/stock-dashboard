# Watchlist 与个股详情页 BRD

## 1. 背景与机会

背景：

- 当前项目已经有美股大盘首页，后续自然路径是从“看市场环境”进入“看自己关心的股票”。
- 用户希望新增两个页面：
  - Watchlist 页面：搜索个股、添加收藏、查看已收藏股票。
  - 个股详情页：类似 Yahoo Finance 的股票详情体验，展示价格、K 线/柱状图、成交量和常用技术指标。
- MVP 仍以个人使用为主，不做账户登录、交易下单或组合盈亏。

用户痛点：

- 首页只能看大盘 proxy，不能沉淀个人关注标的。
- 普通行情站功能多但入口分散，用户想在自己的 dashboard 里快速搜索、收藏、进入详情。
- 技术指标如 MACD、KDJ、Bollinger Bands 需要和 K 线数据联动，不能只放静态数值。

机会判断：

- Watchlist + 个股详情可以把项目从“大盘摘要页”推进到真正可日常使用的个人 stock dashboard。
- 先用浏览器本地存储保存 watchlist，能快速验证体验；后续若需要跨设备同步，再加后端或账户体系。

## 2. 调研结论

### 2.1 股票列表与搜索来源

推荐优先级：

1. **P0 推荐：Massive All Tickers API**
   - 原因：项目现有 market dashboard 已经围绕 Massive 数据源规划和实现；搜索列表、详情行情、OHLC 数据保持同一供应商，能减少 symbol 不匹配。
   - Massive 官方 `GET /v3/reference/tickers` 支持 `search`、`active`、`market`、`type`、分页 `next_url`，返回 ticker、name、market、active、currency、primary exchange 等字段。
   - 适合实现在线搜索：用户输入 `AAPL` 或 `Apple` 时按 API 返回结果展示。
2. **P1 可选：构建本地 symbol cache**
   - 使用 Massive tickers API 定期拉取 active US stocks/ETF，缓存到 `localStorage` 或后续静态 JSON/后端缓存。
   - 好处是搜索更快、减少 API 调用；坏处是需要刷新策略和缓存过期提示。
3. **P1/P2 备选：Nasdaq Trader Symbol Directory**
   - Nasdaq Trader 官方 symbol directory 提供 `nasdaqlisted.txt` 和 `otherlisted.txt`，覆盖 Nasdaq-listed 与其他交易所上市证券，文件会在交易日内周期性更新。
   - 适合做免费/半静态 fallback，但字段与 Massive/Yahoo 风格详情不完全一致，也需要解析、过滤 test issue、ETF、symbol suffix 等规则。
4. **不建议 P0 使用 Alpha Vantage/Finnhub/Twelve Data 作为第三方搜索源**
   - 除非后续决定替换行情供应商，否则多供应商 symbol search 会引入“搜得到但详情数据源不支持”的错配问题。

PM 推荐：

- P0 使用 Massive tickers API 做搜索，参数倾向 `market=stocks&active=true&search=<query>&limit=20`。
- P0 不引入前端搜索库；搜索由 Massive API 的 `search` 参数完成，前端只做 debounce、loading、empty/error 状态和结果排序展示。
- P1 若需要离线/本地全量搜索，再评估 `Fuse.js` 对本地 symbol cache 做 fuzzy search。
- UI 明确只承诺“支持 Massive 可识别的美股/ETF symbol”，不要宣称覆盖全球全部股票。
- 若 API 不可用，显示搜索不可用状态，不从硬编码小列表伪装为全量搜索。

### 2.2 Watchlist 保存方式

推荐：**P0 用 `localStorage`，不用 cookie。**

- Watchlist 是纯前端个人偏好，不需要随每个 HTTP request 发送给服务器。
- Cookie 容量小、会参与请求头、适合 session/auth，不适合保存股票收藏列表。
- `localStorage` 足够保存 ticker、name、exchange、type、addedAt、可选 sort/order。
- 风险是同一浏览器本机有效，不能跨设备同步，清浏览器数据会丢失。

验收文案应明确：

- MVP 收藏保存在当前浏览器。
- 后续如需要跨设备同步，再引入账户或后端存储。

### 2.3 个股图表库与指标

推荐技术方向给 Technical Planner：

1. **图表库首选：TradingView Lightweight Charts**
   - 官方定位是交互式金融图表库，支持 candlestick、bar、line、area、histogram、实时更新、自定义主题和移动端交互。
   - 能覆盖本功能需要的图表形态：
     - K 线：candlestick series。
     - OHLC/bar：bar series。
     - 普通折线：line series。
     - 成交量柱、MACD histogram：histogram series。
     - Bollinger Bands：line series 叠加到主图。
   - 适合实现 Yahoo/TradingView 类的 K 线、成交量柱、指标子图。
   - 比继续自研 SVG 更适合技术分析页面。
2. **指标计算首选：`technicalindicators` 或项目内自研少量公式**
   - `technicalindicators` 支持 MACD、Bollinger Bands、Stochastic Oscillator 等常用指标。
   - KDJ 可以基于 Stochastic/KD 结果计算 J 值：`J = 3K - 2D`；若库不直接提供 KDJ，Technical Planner 应封装并测试公式。
   - 布林带需要 OHLC close 序列；MACD 需要 close 序列；KDJ 需要 high/low/close 序列。
3. **数据源需要 OHLCV**
   - Massive Custom Bars endpoint 提供 OHLCV 聚合数据，适合支撑日线/分钟线和指标计算。
   - 图表指标必须基于同一时间周期的 bars 计算，避免日线 MACD 叠在分钟 K 线上造成误读。
4. **开盘实时更新推荐走 Massive WebSocket**
   - Watchlist quote 和个股详情 header 的价格、涨跌额、涨跌幅，应优先订阅 Massive Stocks WebSocket。
   - 如果当前 Massive plan 是 15 分钟延迟数据，则 UI 必须标注 delayed；如果计划支持 real-time，则 UI 可显示 live。
   - 个股详情图表初始历史数据仍由 REST OHLCV bars 加载；开盘期间可用 WebSocket aggregate/trade 更新最新一根 bar 和 header quote。

PM 推荐：

- P0 个股详情使用日线 `1D` 周期的 K 线 + 成交量 + 指标开关。
- 时间范围支持 `1M`、`3M`、`6M`、`1Y`、`5Y` 或一个较小 MVP 子集。
- P0 指标支持 MACD、KDJ、Bollinger Bands；其他指标留到 P1/P2。
- P0 开盘期间价格应通过 Massive WebSocket 更新；图表最新 bar 可在技术方案中决定是否同步实时更新。
- 明确显示数据延迟和“不构成投资建议”。

## 3. 目标用户与核心场景

目标用户：

- 项目 owner 本人。
- 熟悉基本美股 ticker、watchlist、K 线和常用技术指标。
- 希望默认中文界面，同时保留 ticker、exchange、OHLC、MACD 等英文术语。

核心场景：

1. 用户打开 Watchlist，查看已收藏股票的当前状态。
2. 用户搜索股票代码或公司名称，例如 `AAPL` / `Apple`。
3. 用户从搜索结果添加到 watchlist。
4. 用户点击 watchlist 中的股票，进入个股详情页。
5. 用户在详情页查看价格、涨跌、K 线、成交量、MACD、KDJ、布林带。
6. 用户切换时间范围，图表和指标同步更新。

当前替代方案：

- Yahoo Finance、TradingView、券商 App、Google Finance。

## 4. 产品目标与成功指标

产品目标：

- 用户能在 10 秒内搜索并收藏一只股票。
- 用户能从 watchlist 一键进入个股详情。
- 个股详情页能回答：“这只股票现在多少钱、今天涨跌多少、近期 K 线走势如何、技术指标大概处于什么状态？”

用户成功指标：

- 用户能搜索到常见美股/ETF symbol。
- 用户刷新页面后 watchlist 仍保留。
- 用户能删除收藏。
- 用户能在详情页看到 price header、K 线/柱状图、成交量和至少 3 类技术指标。
- 用户能知道数据来源、最后更新时间和延迟状态。

护栏指标：

- 不展示买入/卖出建议。
- 不把技术指标解释成预测。
- 不承诺实时数据，除非当前 Massive plan 确认支持。
- API 失败时不显示过时价格为“实时价格”。

## 5. MVP 范围

P0 必须有：

- 应用顶部导航新增入口：
  - 首页
  - Watchlist：`/watchlist`
  - 个股详情由搜索结果或 watchlist item 进入
- Watchlist 页面：
  - 搜索输入框，支持 ticker 或公司名称。
  - 搜索结果列表，展示 ticker、公司名、交易所或市场类型。
  - 添加收藏按钮。
  - 已收藏股票以 card grid 展示，而不是普通表格列表。
  - 每张 watchlist card 展示 ticker、公司名、最近价格、今日涨跌幅、数据状态。
  - 点击 watchlist card 的主体区域跳转到个股详情页，例如 `/stocks/AAPL`。
  - 删除按钮作为 card 内独立操作，点击删除时不能触发详情页跳转。
  - 开盘期间，已收藏股票价格和涨跌幅应通过 Massive WebSocket 自动更新；如果连接断开，应保留最后已知值并显示连接状态。
  - 删除收藏按钮。
  - 收藏数据保存在当前浏览器 `localStorage`。
  - 空状态：提示用户搜索并添加第一只股票。
  - 搜索失败状态：展示可重试或稍后再试。
- 个股详情页：
  - URL 使用 `/stocks/:ticker`，例如 `/stocks/AAPL`。
  - Header 展示 ticker、公司名、当前/最近价格、今日涨跌额、今日涨跌幅、最后更新时间、数据延迟。
  - 开盘期间，Header 价格、涨跌额、涨跌幅和最后更新时间应自动刷新。
  - 主图展示 OHLC K 线或 bar/candlestick chart。
  - 成交量以 histogram/volume bars 展示。
  - 技术指标：
    - MACD
    - KDJ
    - Bollinger Bands
  - 指标可开关，默认开启一个合理组合：
    - Bollinger Bands 叠加在主图。
    - Volume 固定展示。
    - MACD 和 KDJ 作为下方指标区域。
  - 时间范围切换，至少支持 `1M`、`6M`、`1Y`。
  - Loading、error、symbol 不存在、数据不足以计算指标等状态。
  - 页面展示免责声明：技术指标仅供研究，不构成投资建议。

P1 应该有：

- Watchlist 支持拖拽或按钮排序。
- Watchlist 显示盘前/盘后状态。
- 搜索结果支持键盘上下选择和 Enter 添加/进入。
- 个股详情支持更多时间范围：`5D`、`3M`、`5Y`、`MAX`。
- 指标参数可配置：
  - MACD fast/slow/signal
  - KDJ period/signal
  - Bollinger period/stdDev
- Watchlist 本地导入/导出 JSON。
- 缓存最近搜索结果，减少重复请求。

P2 可以后续做：

- 用户账户和云端同步 watchlist。
- 多 watchlist 分组。
- 新闻、财报、公司简介、估值摘要。
- 价格提醒。
- 画线工具。
- 更多指标：RSI、MA/EMA、VWAP、ATR、Ichimoku。
- 服务端 proxy，避免前端暴露 API key。

明确不做：

- 不做交易下单。
- 不做 portfolio 成本、仓位和盈亏。
- 不做买卖信号推荐。
- 不做实时 Level 2、bid/ask/order book。
- 不做全球所有市场覆盖承诺。
- 不在 PM 阶段安装新依赖或改生产代码。

## 6. 用户流程

### 6.1 添加收藏

1. 用户进入 Watchlist 页面。
2. 用户看到搜索框和当前收藏列表。
3. 用户输入 ticker 或公司名。
4. 系统展示搜索结果。
5. 用户点击添加收藏。
6. 股票出现在 watchlist 中。
7. 用户刷新页面后，收藏仍存在。

异常/边界情况：

- 输入为空：不发请求，显示默认空状态。
- 输入过短：可提示继续输入，或允许 ticker 精确搜索。
- API 返回空：显示未找到匹配股票。
- 已收藏：按钮显示已添加或禁用。
- `localStorage` 不可用：内存降级并提示刷新后可能丢失。

### 6.2 删除收藏

1. 用户在 watchlist item 上点击删除。
2. 系统移除该股票。
3. 刷新页面后该股票不再出现。

### 6.3 进入个股详情

1. 用户点击搜索结果或 watchlist card 主体区域。
2. 系统导航到个股详情页。
3. 页面加载公司信息、最新价格和 OHLCV bars。
4. 系统基于 bars 计算并展示技术指标。

异常/边界情况：

- symbol 无效：显示“未找到该股票”。
- OHLCV 数据为空：显示暂无图表数据。
- bars 数量不足：K 线展示可用数据，指标区域显示“数据不足以计算该指标”。
- 行情 API 失败：保留页面结构，显示错误和重试入口。

## 7. 功能需求

| 功能名称 | 用户价值 | 需求描述 | 优先级 | 依赖 |
| --- | --- | --- | --- | --- |
| 顶部导航 | 在页面间移动 | 导航支持首页和 Watchlist，个股详情可通过 symbol URL 访问 | P0 | 前端 routing |
| 股票搜索 | 找到目标股票 | 支持按 ticker/公司名搜索 Massive active stocks | P0 | Massive tickers API |
| 搜索结果 | 判断是否选对股票 | 展示 ticker、name、exchange/market/type、添加状态 | P0 | 搜索服务 |
| 添加收藏 | 保存关注股票 | 用户可从搜索结果添加到本地 watchlist | P0 | localStorage |
| 删除收藏 | 管理关注列表 | 用户可从 watchlist 移除股票 | P0 | localStorage |
| Watchlist 持久化 | 刷新后保留 | 收藏列表保存到当前浏览器 localStorage | P0 | storage adapter |
| Watchlist card grid | 快速扫关注股票 | 已收藏股票以响应式 card grid 展示；card 主体可点击进入详情页 | P0 | watchlist storage + quote |
| Watchlist quote | 快速扫状态 | 收藏 card 显示价格、涨跌幅、数据更新时间或不可用状态 | P0 | quote/snapshot 数据 |
| Watchlist 实时更新 | 开盘时保持价格新鲜 | 开盘期间使用 Massive WebSocket 更新已收藏股票 quote；连接异常时显示状态并保留最后已知值 | P0 | Massive WebSocket |
| 个股详情 header | 快速确认标的状态 | 展示 ticker、name、price、change、changePercent、last updated、data delay | P0 | ticker overview + quote |
| 详情页实时 quote | 开盘时看到最新价格 | 个股详情页打开时订阅当前 ticker 的 Massive WebSocket quote/aggregate，自动更新 header | P0 | Massive WebSocket |
| OHLC 主图 | 查看价格走势 | 展示 K 线或 bar/candlestick chart | P0 | OHLCV bars + chart library |
| 成交量柱 | 查看交易活跃度 | 使用 histogram/volume bars 展示 volume | P0 | OHLCV bars |
| MACD | 查看趋势动量 | 基于 close 计算 MACD、signal、histogram，并作为指标区域展示 | P0 | indicator calculator |
| KDJ | 查看超买超卖和动量 | 基于 high/low/close 计算 K、D、J，并作为指标区域展示 | P0 | indicator calculator |
| Bollinger Bands | 查看波动区间 | 基于 close 计算 upper/middle/lower bands，叠加到主图 | P0 | indicator calculator |
| 时间范围 | 控制研究窗口 | 支持至少 1M、6M、1Y，切换后重新获取/计算 bars 和指标 | P0 | OHLC API |
| 数据状态 | 避免误读 | 明确展示 last updated、延迟、API 错误/缓存状态 | P0 | service state |
| 免责声明 | 产品护栏 | 展示技术指标仅供研究、不构成投资建议 | P0 | UI 文案 |

## 8. 用户故事与验收标准

### US1：用户可以搜索股票

作为个人投资者，我希望按 ticker 或公司名搜索股票，以便找到想收藏或查看的标的。

验收标准：

- Given 用户在 Watchlist 页面
- When 用户输入 `AAPL`
- Then 页面展示匹配搜索结果
- And 搜索结果至少包含 ticker 和公司名
- And 搜索结果可添加到 watchlist 或进入详情页

### US2：用户可以添加并持久化 watchlist

作为个人投资者，我希望添加股票到 watchlist，并在刷新后仍看到它们。

验收标准：

- Given 搜索结果中有 `AAPL`
- When 用户点击添加收藏
- Then `AAPL` 出现在 watchlist
- When 用户刷新页面
- Then `AAPL` 仍出现在 watchlist
- And 数据来源说明为当前浏览器本地保存

### US3：用户可以删除收藏

作为个人投资者，我希望删除不再关注的股票，以便保持 watchlist 干净。

验收标准：

- Given watchlist 中有 `AAPL`
- When 用户点击删除
- Then `AAPL` 从 watchlist 消失
- When 用户刷新页面
- Then `AAPL` 不再出现在 watchlist

### US4：用户可以进入个股详情页

作为个人投资者，我希望从 watchlist 或搜索结果进入个股详情页，以便查看该股票走势。

验收标准：

- Given watchlist 中有 `AAPL`
- When 用户点击 `AAPL` watchlist card 主体区域
- Then 页面导航到 `AAPL` 的详情页
- And 页面 header 展示 `AAPL`、公司名、价格、涨跌额、涨跌幅
- When 用户点击 card 内删除按钮
- Then `AAPL` 从 watchlist 移除
- And 页面不导航到详情页

### US5：个股详情页展示 K 线和成交量

作为个人投资者，我希望看到 K 线和成交量，以便判断近期价格和成交变化。

验收标准：

- Given `AAPL` OHLCV 数据加载成功
- When 用户打开详情页
- Then 页面展示 candlestick 或 OHLC bar chart
- And 页面展示成交量柱状图
- And 图表与当前选择时间范围一致

### US5.1：开盘期间价格自动更新

作为个人投资者，我希望在开盘期间 watchlist 和个股详情价格自动更新，以便不用手动刷新页面。

验收标准：

- Given 美股处于开盘时段
- And Massive WebSocket 连接成功
- When 当前 watchlist 或详情页订阅的 ticker 收到新行情
- Then 页面价格、涨跌额、涨跌幅和最后更新时间自动更新
- And 页面明确显示 live 或 delayed 状态
- When WebSocket 断开
- Then 页面保留最后已知价格
- And 显示连接异常或重连状态

### US6：用户可以查看 MACD、KDJ、布林带

作为个人投资者，我希望在图表中查看常用技术指标，以便辅助研究走势。

验收标准：

- Given OHLCV bars 数量足够
- When 用户打开详情页
- Then 页面展示 MACD 指标
- And 页面展示 KDJ 指标
- And 页面展示 Bollinger Bands
- And 指标根据当前时间范围的 bars 计算
- And 页面说明技术指标不构成投资建议

### US7：数据不足时页面给出明确状态

作为用户，我希望在指标无法计算时看到原因，而不是看到空白或错误图表。

验收标准：

- Given OHLCV bars 数量不足以计算 MACD
- When 用户打开详情页
- Then K 线仍尽可能展示
- And MACD 区域显示数据不足提示
- And 页面不崩溃

## 9. 数据需求

股票搜索结果最小字段：

- `ticker`
- `name`
- `market`
- `locale`
- `primary_exchange`
- `type`
- `active`
- `currency_name` 或 `currency_symbol`

Watchlist 本地存储字段：

- `symbol`
- `name`
- `primaryExchange`
- `type`
- `addedAt`
- `sortOrder`

个股详情 header 字段：

- `symbol`
- `name`
- `price`
- `change`
- `changePercent`
- `lastUpdated`
- `dataDelayMinutes`
- `marketStatus`

OHLCV bar 字段：

- `time`
- `open`
- `high`
- `low`
- `close`
- `volume`
- 可选 `vwap`

指标字段：

- MACD：`macd`、`signal`、`histogram`
- KDJ：`k`、`d`、`j`
- Bollinger Bands：`upper`、`middle`、`lower`

## 10. 内容与文案要求

- 默认中文沟通和中文 UI。
- ticker、OHLC、MACD、KDJ、Bollinger Bands、ETF 等术语可保留英文。
- Watchlist 空状态文案应简短直接，不做营销页。
- 技术指标说明应避免预测语气，例如：
  - 可以说“用于观察趋势动量”。
  - 不要说“提示买入/卖出”。
- 页面必须展示“不构成投资建议”。

## 11. 非功能需求

- 搜索输入应有 debounce，避免每个按键都打 API。
- 搜索结果应限制数量，P0 建议 20 条以内。
- 图表在桌面和移动端都不能溢出或遮挡文字。
- Watchlist 操作应即时反馈。
- API key 不应 commit 到仓库。
- 生产或共享部署前，应评估是否需要后端 proxy。
- 本地存储 corrupt 时应安全恢复为空数组，不导致页面崩溃。

## 12. 风险与待确认

风险：

- Massive API key 如果放在前端，只适合本机个人 MVP；共享部署会暴露 key。
- Massive plan 的数据延迟、历史范围和 endpoint 权限会影响图表可用时间范围。
- Massive WebSocket 可订阅数量、连接数限制和当前 plan 的实时/延迟权限会影响 watchlist 实时刷新能力。
- 搜索结果可能包含 ETF、ADR、preferred、warrant 等类型，需要明确 P0 过滤范围。
- KDJ 不是所有 JS 指标库都直接提供，可能需要用 Stochastic/KD 结果派生 J 值。
- 技术指标图表如果一次性支持太多参数，会拖慢 MVP。

`NEEDS CLARIFICATION`：

- P0 搜索范围是否只覆盖美股普通股 + ETF，还是也包括 ADR、REIT、preferred、warrant、OTC？
- 个股详情默认时间周期是日线，还是还需要分钟线？
- 图表最新一根 K 线是否必须随 WebSocket 实时滚动，还是 P0 只要求 header/watchlist quote 实时更新？
- Watchlist 是否需要默认预置一些股票，还是完全空白由用户添加？
- URL 已定为 `/watchlist` 和 `/stocks/:ticker`；Technical Planner 需要决定是否引入 `react-router-dom` 来实现 routing。
- 是否批准新增图表/指标依赖，例如 `lightweight-charts` 和 `technicalindicators`？

## 13. 给 Technical Planner 的建议

- 先检查当前 React app 是否已有 routing；如果没有，需要评估新增 `react-router-dom` 是否值得。
- 若实现 Yahoo 风格个股页，建议引入专业金融图表库，而不是沿用首页自研 SVG line chart。
- 推荐方案：
  - 图表：`lightweight-charts`
  - 指标：`technicalindicators` 或少量自研指标函数
  - 股票搜索/详情数据：优先 Massive REST endpoints
  - 本地收藏：storage adapter + `localStorage`
- 新依赖必须列入 tech plan，并等待用户确认后由 TDD agent 安装。
- 技术方案需要明确：
  - API key 管理方式
  - symbol search debounce/cache 策略
  - OHLCV 获取周期和时间范围映射
  - 指标计算公式和数据不足状态
  - 图表多 pane/overlay 方案
  - 测试策略

## 14. 调研来源

- Massive Stocks Overview：`https://massive.com/docs/rest/stocks/overview`
- Massive All Tickers：`https://massive.com/docs/rest/stocks/tickers/all-tickers`
- Massive Custom Bars OHLC：`https://massive.com/docs/rest/stocks/aggregates/custom-bars`
- Nasdaq Trader Symbol Directory definitions：`https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs`
- TradingView Lightweight Charts：`https://www.tradingview.com/lightweight-charts/`
- Lightweight Charts docs：`https://tradingview.github.io/lightweight-charts/`
- technicalindicators GitHub：`https://github.com/anandanand84/technicalindicators`
