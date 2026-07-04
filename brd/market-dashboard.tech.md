# 技术方案：美股大盘首页 Dashboard

## 1. 来源

- BRD: `./brd/market-dashboard.md`
- 任务清单: `./brd/market-dashboard.tasks.md`
- 创建者: technical-planner
- 语言: 中文

## 2. 摘要

- 推荐实现 WebSocket-first 的美股大盘首页：`SPY`、`QQQ`、`DIA` 使用 Massive Stocks WebSocket 的 per-minute aggregates (`AM`) 驱动实时卡片和 line chart。
- VIX 优先使用 Massive Indices WebSocket；如果用户当前只购买 Stocks 会员且无法订阅 indices feed，则临时使用 FearGreedChart API 返回的 `market.^VIX` 作为 VIX 数据源。
- Fear & Greed 模块直接调用 `https://feargreedchart.com/api/?action=all`，通过 `localStorage` 做 15 分钟 TTL cache；API 不可用且无有效缓存时隐藏模块，不做 fallback 估算。
- 顶部 bar 支持中文 / English 切换。MVP 使用项目内轻量文案字典和 React state，不引入第三方 i18n 库，不持久化语言偏好。
- 不建议 MVP 阶段引入图表库或 gauge 库。line chart 和 gauge 使用轻量 SVG/HTML/CSS 组件实现，减少依赖、降低 Planner/TDD 复杂度。
- Mock market data 只用于测试、初始占位和 WebSocket 不可用时的开发 fallback，不作为最终行情来源。

## 3. 技术上下文

- 项目类型: Vite React 单页应用
- 语言/框架: JavaScript, React 19, Vite
- 包管理器: npm
- 现有测试框架: Vitest, React Testing Library, jsdom
- 构建命令: `npm run build`
- 测试命令: `npm test`
- Lint 命令: `npm run lint`
- 运行平台: 浏览器前端，本地开发由 Vite dev server 提供
- 相关现有文件:
  - `src/App.jsx`: 当前默认 Vite 页面，将改为 app shell，只渲染 `DashboardHome`
  - `src/pages/DashboardHome.jsx`: 新增首页页面容器，承载 dashboard 数据 orchestration 和页面布局
  - `src/App.css`: 当前默认样式，将替换为 dashboard 样式
  - `src/App.test.jsx`: 当前示例测试，将替换/扩展为 dashboard 组件测试
  - `src/setupTests.js`: jest-dom setup 已配置
  - `vite.config.js`: Vitest jsdom 环境已配置
  - `package.json`: 已有 `npm test`, `npm run build`, `npm run lint`
- 约束条件:
  - 默认中文 UI，但顶部 bar 必须支持 English 切换
  - 不新增依赖，除非用户后续明确批准
  - Massive WebSocket 需要 API key 鉴权；生产或共享部署不能在前端暴露 key
  - MVP 本机个人使用可以临时用前端环境变量，但后续正式方案应使用后端 WebSocket proxy
  - 不做蜡烛图
  - Fear & Greed API 失败且无有效 cache 时隐藏模块
  - 长运行命令如 `npm run dev` 需要用户请求后再启动

## 4. 需求映射

| 需求 / 用户故事 | 技术影响 | 测试覆盖 | 备注 |
| --- | --- | --- | --- |
| US1 三大指数状态 | 需要 market data model、Massive WebSocket adapter、指数卡片、SVG line chart | 组件测试确认 SPY/QQQ/DIA 卡片和 line chart 渲染；service 测试覆盖 AM message normalization | 使用 Stocks WebSocket `AM.SPY,AM.QQQ,AM.DIA` |
| US2 VIX 风险等级 | 需要 VIX 数据源选择、VIX risk threshold utility 和 gauge 组件 | 单元测试覆盖阈值边界，组件测试覆盖中文风险文案 | VIX 优先 Massive Indices，必要时 FearGreedChart `market.^VIX` |
| US3 市场脉搏 | 需要 index trend score、VIX risk score、market pulse score 和状态映射 | 单元测试覆盖分数和状态映射，组件测试覆盖 gauge | 这是自定义 derived metric，需解释 |
| US4 市场风格 | 需要 leadership score 和 label utility | 单元测试覆盖科技股领涨、蓝筹股领涨、走势均衡、整体偏弱 | 使用 SPY/QQQ/DIA 1D/5D/1M |
| US5 数据时效 | 需要 last updated、data delay、market status 的数据模型和展示 | 组件测试确认“数据延迟 15 分钟”和市场状态可见 | 时间格式先用 mock 值 |
| US6 Metric 解释 | 需要可点击的 explanation disclosure/popover | 组件测试确认点击“如何计算？”后显示解释和非交易建议 | 用 button + expandable panel，保证键盘可访问 |
| US7 Fear & Greed | 需要 API adapter、response normalizer、15 分钟 localStorage cache、状态映射、隐藏逻辑 | 单元测试覆盖 adapter/cache/status；组件测试覆盖有数据时显示、无数据时隐藏 | API 可用性/CORS 仍需实现时验证 |
| US8 中英文切换 | 需要语言 state、文案字典、状态 label 本地化、组件文案 props | 组件测试覆盖默认中文、切换英文、切回中文、核心数值不变 | 不新增 i18n 依赖，不持久化语言 |

## 5. 推荐实现方案

- 组件/UI 方案:
  - `App.jsx` 只负责渲染 `DashboardHome`。
  - `src/pages/DashboardHome.jsx` 负责组装首页页面，并通过 hook/service 订阅 Massive WebSocket 行情；同时持有 `language` state，默认 `zh`。
  - 新增 `TopBar`、`IndexCard`、`LineChart`、`GaugeCard`、`FearGreedCard`、`MarketStyleCard`、`MetricExplanation` 等小组件。
  - `TopBar` 渲染 segmented language control：`中文` / `English`，通过 `onLanguageChange` 回传选择。
  - Gauge 使用 SVG 半圆或 CSS progress-like 视觉，不依赖第三方库。
  - Line chart 使用 SVG polyline，根据 closes 归一化生成 points。
  - 首页布局使用 full-width app shell，不做 landing page，不使用默认 Vite hero。
- 状态/数据模型:
  - `MarketSymbol` 包含 `symbol`、`nameZh`、`nameEn`、`price`、`change`、`changePercent`、`returns`、`closes`、`lastUpdated`、`connectionStatus`。
  - `VixData` 复用 market symbol，并由 utility 映射风险等级。
  - `FearGreedData` 包含 `score`、`status`、`components`、`updatedAt`、`fromCache`。
  - `DashboardData` 聚合三大指数、VIX、market status、data delay。
- 本地化方案:
  - 新增 `src/i18n/dashboardCopy.js`，集中维护 `zh` / `en` 文案、状态 label、模块标题、解释文案和免责声明。
  - 新增 `src/i18n/dashboardCopy.test.js`，覆盖关键状态和 fallback，避免文案 key 缺失。
  - `marketMetrics.js` 的纯计算函数继续返回稳定 key，例如 `weak`、`neutral`、`strong`、`calm`、`normal`、`techLed`；UI 层用文案字典映射当前语言 label。
  - Fear & Greed API 组件名称、raw 和 API 字段保持英文；可对已知组件提供中英文 display label / explanation fallback。
  - 语言切换只改变 render 文案，不触发 market data hook 重新初始化，不重新调用 WebSocket 或 FearGreed service。
- Service/helper 层:
  - `src/data/mockMarketData.js` 提供稳定 mock 数据，作为测试和开发 fallback。
  - `src/services/massiveWebSocket.js` 负责连接、鉴权、订阅、message parsing、断线重连。
  - `src/services/massiveMessageAdapter.js` 负责把 Massive `AM` aggregate message 转成内部 `MarketSymbol` update。
  - `src/hooks/useMassiveMarketData.js` 负责 React state 集成和 cleanup。
  - `src/utils/marketMetrics.js` 负责纯计算：VIX risk、market pulse、market style、status mapping。
  - `src/services/fearGreedApi.js` 负责 fetch + normalize。
  - `src/services/fearGreedCache.js` 负责 localStorage TTL cache。
  - `src/services/fearGreedService.js` 负责“先 cache，过期再 API”的 orchestration。
- 样式方案:
  - 继续使用普通 CSS，主要集中在 `src/App.css`。
  - 使用深色/中性色的交易 dashboard 风格，但避免单一深蓝/紫色主题。
  - Gauge 颜色遵循中文状态：绿色/黄色/橙色/红色。
  - 卡片 radius 不超过 8px。
- 错误/加载/空状态:
  - Market data 初始显示 loading/skeleton 或 mock fallback；WebSocket 连接成功后显示 live/delayed 状态。
  - WebSocket 断开时显示连接状态，不清空已有数据。
  - Fear & Greed 加载中可显示 skeleton 或不占位；API/cache 均无数据时隐藏。
  - Fear & Greed cache 数据显示“缓存于 [time]”。
- 可访问性考虑:
  - Gauge 不能只靠颜色，必须展示分数和中文标签。
  - SVG line chart 加 `role="img"` 和中文 `aria-label`。
  - “如何计算？”使用 button 控制展开内容。
  - 语言切换控件使用 `button`，通过 `aria-pressed` 或等价状态表达当前语言。
  - 外部 API 不可用时不显示空白卡片。

## 6. 依赖与库选择

| Library | 用途 | 是否已安装 | 选择理由 | 替代方案 | 风险 | 是否需要用户确认 |
| --- | --- | --- | --- | --- | --- | --- |
| React | UI 组件 | yes | 已是项目核心依赖 | 无 | 无 | no |
| Vitest | 单元/组件测试 | yes | 已配置 | Jest | 无 | no |
| React Testing Library | 组件测试 | yes | 已配置 | Cypress component test | 无 | no |

不建议新增依赖。

## 7. 预计修改文件

| 文件路径 | 变更类型 | 用途 |
| --- | --- | --- |
| `src/App.jsx` | modify | 替换默认 Vite 页面，只渲染 `DashboardHome` |
| `src/pages/DashboardHome.jsx` | create | 首页页面容器，组装 dashboard UI 和数据 |
| `src/App.css` | modify | 替换默认样式，定义 dashboard 布局和组件样式 |
| `src/index.css` | modify | 更新全局 reset、字体、body 背景 |
| `src/data/mockMarketData.js` | create | 提供 SPY/QQQ/DIA/VIX mock 数据、market status 和更新时间 |
| `src/i18n/dashboardCopy.js` | create | 集中维护 dashboard 中文 / English 文案、状态映射和解释文案 |
| `src/i18n/dashboardCopy.test.js` | create | 覆盖本地化文案 key、状态 label 和 fallback |
| `src/services/massiveWebSocket.js` | create | Massive WebSocket 连接、鉴权、订阅、重连和 cleanup |
| `src/services/massiveMessageAdapter.js` | create | Normalize Massive `AM` aggregate message 到内部 market data update |
| `src/services/massiveWebSocket.test.js` | create | 覆盖 subscribe/auth message、message routing 和 reconnect 边界 |
| `src/services/massiveMessageAdapter.test.js` | create | 覆盖 `AM` message 到 market data update 的转换 |
| `src/hooks/useMassiveMarketData.js` | create | React hook，订阅 SPY/QQQ/DIA，并维护 market data state |
| `src/utils/marketMetrics.js` | create | 提供 VIX、market pulse、market style、Fear & Greed status 等纯计算函数 |
| `src/utils/marketMetrics.test.js` | create | 覆盖 metric 计算和状态映射 |
| `src/services/fearGreedCache.js` | create | localStorage 15 分钟 TTL cache |
| `src/services/fearGreedCache.test.js` | create | 覆盖 cache hit/miss/expired/corrupt 行为 |
| `src/services/fearGreedApi.js` | create | fetch FearGreedChart API 并 normalize response |
| `src/services/fearGreedApi.test.js` | create | 覆盖 API response adapter 和异常行为 |
| `src/services/fearGreedService.js` | create | cache-first orchestration |
| `src/components/TopBar.jsx` | create | 顶部 bar |
| `src/components/IndexCard.jsx` | create | 三大指数卡片 |
| `src/components/LineChart.jsx` | create | 轻量 SVG line chart |
| `src/components/GaugeCard.jsx` | create | 通用 gauge card |
| `src/components/FearGreedCard.jsx` | create | Fear & Greed gauge + component breakdown |
| `src/components/MarketStyleCard.jsx` | create | 市场风格标签 |
| `src/components/MetricExplanation.jsx` | create | 可访问的解释展开组件 |
| `src/App.test.jsx` | modify | 替换默认 counter 测试，覆盖首页关键 UI |

## 8. 测试策略

- 单元测试:
  - `getVixRiskLevel`
  - `calculateMarketPulse`
  - `getMarketPulseStatus`
  - `calculateMarketStyle`
  - `getFearGreedStatus`
  - `normalizeFearGreedResponse`
  - `readFearGreedCache` / `writeFearGreedCache`
  - `normalizeMassiveAggregateMessage`
  - Massive WebSocket subscribe/auth message builder
  - `getDashboardCopy`
  - `getLocalizedStatusLabel`
- 组件测试:
  - 首页渲染顶部 bar、SPY/QQQ/DIA、VIX 风险、市场脉搏、市场风格、数据延迟
  - 点击“如何计算？”后展示解释和“不构成交易建议”
  - Fear & Greed 有数据时显示分数、状态、组件；无数据时不显示模块
  - 默认中文渲染；点击 English 后模块标题、状态标签、解释入口和免责声明变为英文；切回中文后恢复
  - 语言切换前后 SPY/QQQ/DIA/VIX 数值、百分比和 gauge 分数保持不变
- 集成/E2E 测试:
  - MVP 暂不做 Playwright/Cypress
- 不测试的内容:
  - 真实 Massive WebSocket 网络连接
  - FearGreedChart API 的真实网络稳定性
  - SVG 视觉像素级精度
  - 交易日历真实开闭市判断
- Mock 策略:
  - 使用 mock market data 覆盖 dashboard UI 初始状态
  - 使用 mocked WebSocket 覆盖 Massive WebSocket service
  - 使用 mocked `fetch` 覆盖 FearGreedChart API adapter
  - 使用可注入 `storage` 和 `now` 覆盖 local cache
- 验证命令:
  - `npm test`
  - `npm run build`
  - `npm run lint`

## 9. 风险与待确认问题

- 风险:
  - FearGreedChart API 可能存在 CORS、限流、字段变化或服务不可用。
  - Massive API key 不能放在生产前端，因此正式部署需要后端/proxy 或其他安全方案。
  - VIX 可能需要 Massive Indices 会员，Stocks 会员可能只能覆盖 SPY/QQQ/DIA。
  - Massive WebSocket 默认每个 asset class 可能有连接数限制，需避免多开连接。
  - 自定义 market pulse / market style 容易被误解为交易信号，UI 必须显示解释和免责声明。
  - SVG gauge/line chart 自研需要注意响应式和可访问性。
  - 双语文案若散落在组件内，后续新增模块容易漏翻译；应集中维护字典。
- `NEEDS CLARIFICATION` 项:
  - 用户购买的是 Stocks 会员还是同时购买 Indices 会员？这决定 VIX 是否走 Massive WebSocket。
  - Massive API key MVP 是否允许通过 `VITE_MASSIVE_API_KEY` 暴露在本机前端？Planner 建议仅限本机个人使用；共享部署必须改 proxy。
  - 时间显示用 ET、本地时间，还是两者都显示？Planner 建议 MVP 使用“ET”文案和 mock timestamp。
  - FearGreedChart API 若发生 CORS 问题，是否允许后续加 server proxy？需要实现时验证。
  - 中英文切换控件最终视觉使用 segmented control、按钮组还是 menu？Planner 建议 MVP 用 segmented control。
- 假设:
  - TDD agent 可以在浏览器端使用 `fetch` 调用 FearGreedChart API。
  - TDD agent 可以在浏览器端使用 WebSocket API 连接 Massive delayed/real-time endpoint。
  - `localStorage` 足够作为 15 分钟 cache，不需要 IndexedDB。
  - MVP 支持 `zh` 和 `en` 两种 UI 语言，默认 `zh`，不持久化选择。

## 10. 交接给 TDD Agent 的说明

- TDD agent 应先读:
  - `docs/project-context.md`
  - `AGENTS.md`
  - `brd/market-dashboard.md`
  - `brd/market-dashboard.tech.md`
  - `brd/market-dashboard.tasks.md`
- 哪些测试应先写:
  - 先写 `src/utils/marketMetrics.test.js`，覆盖所有阈值和分数映射。
  - 再写 Massive message adapter / WebSocket service 测试。
  - 再写 Fear & Greed API/cache 测试。
  - 最后替换 `src/App.test.jsx`，覆盖页面关键中文 UI。
  - 对 US8，先写 `src/i18n/dashboardCopy.test.js` 和 `src/App.test.jsx` 中的语言切换组件测试。
- 哪些任务是 MVP:
  - 所有 P0 UI、Massive WebSocket service、metric 计算、FearGreed cache-first adapter、解释入口和免责声明。
  - 顶部中英文切换、当前语言视觉状态、当前语言 metric 解释和免责声明。
- 哪些事情不要做:
  - 不安装 chart/gauge 库。
  - 不使用 Massive REST 作为主要行情来源。
  - 不把 API key commit 到仓库。
  - 不做蜡烛图。
  - 不实现 watchlist。
  - 不做 portfolio、新闻、交易提醒。
  - 不在 API 失败时显示 Fear & Greed fallback 估算。
