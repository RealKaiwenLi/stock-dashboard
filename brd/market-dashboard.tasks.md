# 任务清单：美股大盘首页 Dashboard

## 1. 输入

- BRD: `./brd/market-dashboard.md`
- 技术方案: `./brd/market-dashboard.tech.md`
- 创建者: technical-planner
- 语言: 中文

## 2. 执行规则

- TDD agent 必须按顺序完成任务，除非任务标记了 `[P]`。
- 每个行为任务必须先写测试，再写实现。
- 每个完成的 phase 都必须能独立验证。
- 除非任务明确说明需要用户确认且用户已经批准，否则不要安装依赖。
- 不要把 Massive API key 写入代码或提交到仓库。

## 3. 任务格式

所有任务必须使用严格格式：

`- [ ] T001 [P?] [US?] Description with exact file path`

格式规则：
- 每个任务必须以 `- [ ]` 开头。
- Task ID 必须连续：T001, T002, T003...
- `[P]` 只用于可并行任务，条件是不同文件且不依赖未完成任务。
- `[US1]`, `[US2]` 等用于标注对应用户故事；setup/foundation/polish 任务可以没有 US 标签。
- 描述必须包含明确文件路径。
- 避免模糊任务，例如“完善 UI”“处理逻辑”“修 bug”。

## 4. Phase 1：准备工作

**目标**: 建立 dashboard 文件结构、环境变量说明和测试入口。

- [ ] T001 创建页面、组件、数据、service、hook、utility 目录占位：`src/pages/`、`src/components/`、`src/data/`、`src/services/`、`src/hooks/`、`src/utils/`
- [ ] T002 创建 `.env.example`，记录 `VITE_MASSIVE_API_KEY=` 和本机个人使用的安全说明
- [ ] T003 更新 `src/App.test.jsx` 的测试规划，移除默认 counter 行为假设，准备覆盖 dashboard 首页

## 5. Phase 2：基础能力

**目标**: 完成可测试的纯计算、mock 数据、Massive WebSocket adapter、Fear & Greed cache/API，为 UI phase 提供稳定输入。

- [ ] T004 [P] 创建 `src/data/mockMarketData.js`，提供 SPY、QQQ、DIA、VIX、lastUpdated、dataDelay、marketStatus 的 mock 数据
- [ ] T005 [P] 在 `src/utils/marketMetrics.test.js` 为 VIX 风险等级边界写失败测试
- [ ] T006 在 `src/utils/marketMetrics.js` 实现 VIX 风险等级映射，使 T005 通过
- [ ] T007 [P] 在 `src/utils/marketMetrics.test.js` 为市场脉搏分数和状态映射写失败测试
- [ ] T008 在 `src/utils/marketMetrics.js` 实现 `calculateMarketPulse` 和 `getMarketPulseStatus`，使 T007 通过
- [ ] T009 [P] 在 `src/utils/marketMetrics.test.js` 为市场风格计算写失败测试
- [ ] T010 在 `src/utils/marketMetrics.js` 实现 `calculateMarketStyle`，使 T009 通过
- [ ] T011 [P] 在 `src/utils/marketMetrics.test.js` 为 Fear & Greed 状态区间写失败测试
- [ ] T012 在 `src/utils/marketMetrics.js` 实现 `getFearGreedStatus`，使 T011 通过
- [ ] T013 [P] 在 `src/services/massiveMessageAdapter.test.js` 为 Massive `AM` aggregate message normalization 写失败测试
- [ ] T014 在 `src/services/massiveMessageAdapter.js` 实现 `normalizeMassiveAggregateMessage`，把 `ev/sym/o/c/h/l/s/e` 转成内部 market update，使 T013 通过
- [ ] T015 [P] 在 `src/services/massiveWebSocket.test.js` 为 Massive auth/subscribe message builder 写失败测试
- [ ] T016 在 `src/services/massiveWebSocket.js` 实现 auth message、subscribe message、channel list builder，使 T015 通过
- [ ] T017 在 `src/services/massiveWebSocket.test.js` 为 WebSocket message routing、close cleanup、reconnect scheduling 写失败测试
- [ ] T018 在 `src/services/massiveWebSocket.js` 实现连接、鉴权、订阅 `AM.SPY,AM.QQQ,AM.DIA`、message routing、cleanup 和有限重连，使 T017 通过
- [ ] T019 [P] 在 `src/hooks/useMassiveMarketData.test.jsx` 为 market data hook 初始 mock 数据和接收 update 后更新 state 写失败测试
- [ ] T020 在 `src/hooks/useMassiveMarketData.js` 实现 React hook，使用 mock 初始数据并接入 `massiveWebSocket`，使 T019 通过
- [ ] T021 [P] 在 `src/services/fearGreedCache.test.js` 为 15 分钟 localStorage cache 写失败测试，覆盖 hit、miss、expired、corrupt JSON
- [ ] T022 在 `src/services/fearGreedCache.js` 实现 cache read/write/expiry，TTL 固定为 15 分钟，使 T021 通过
- [ ] T023 [P] 在 `src/services/fearGreedApi.test.js` 为 FearGreedChart API response normalization 写失败测试
- [ ] T024 在 `src/services/fearGreedApi.js` 实现 `normalizeFearGreedResponse` 和 fetch adapter，使 T023 通过
- [ ] T025 在 `src/services/fearGreedService.js` 实现 cache-first orchestration：未过期 cache 直接返回，过期或缺失才调用 API，失败且无 cache 返回 null

## 6. Phase 3：用户故事 1 - 三大指数状态（优先级：P1）

**目标**: 首页展示 SPY、QQQ、DIA 三张指数卡片和 line chart，不展示蜡烛图；数据来自 `useMassiveMarketData`，初始可用 mock，WebSocket update 到达后自动刷新。

**独立验证方式**: `npm test` 中首页组件测试能找到三张指数卡、中文名称、ticker、价格、涨跌、5 日/1 月表现和 line chart aria label。

### 测试任务

- [ ] T026 [US1] 在 `src/App.test.jsx` 写失败测试，确认首页展示 SPY、QQQ、DIA 三张指数卡片和 line chart

### 实现任务

- [ ] T027 [US1] 创建 `src/components/LineChart.jsx`，使用 SVG polyline 渲染 closes，并提供中文 `aria-label`
- [ ] T028 [US1] 创建 `src/components/IndexCard.jsx`，展示中文名称、ticker、当前价格、今日涨跌点数、今日涨跌幅、5 日表现、1 月表现和 `LineChart`
- [ ] T029 [US1] 创建 `src/pages/DashboardHome.jsx`，使用 `useMassiveMarketData` 渲染三大指数区域；修改 `src/App.jsx` 只渲染 `DashboardHome`，使 T026 通过

**检查点**: 三大指数区域可独立渲染，页面无默认 Vite hero/counter 内容。

## 7. Phase 4：用户故事 2 - VIX 风险等级（优先级：P1）

**目标**: 首页展示 VIX 风险 gauge，使用 BRD 固定阈值和中文状态。VIX 优先来自 Massive Indices；如果不可用，使用 FearGreedChart `market.^VIX` 或 mock VIX。

**独立验证方式**: 组件测试能找到 VIX 当前值和“平静/正常/警惕/紧张/恐慌”之一。

### 测试任务

- [ ] T030 [US2] 在 `src/App.test.jsx` 写失败测试，确认 VIX 风险 gauge 显示当前值和中文风险等级

### 实现任务

- [ ] T031 [US2] 创建 `src/components/GaugeCard.jsx`，支持 0-100 或数值型 gauge、颜色、中文状态和解释入口
- [ ] T032 [US2] 修改 `src/pages/DashboardHome.jsx`，接入 VIX risk utility 和 `GaugeCard`，使 T030 通过

**检查点**: VIX gauge 可独立表达风险等级，且不只依赖颜色。

## 8. Phase 5：用户故事 3 - 市场脉搏（优先级：P1）

**目标**: 首页展示市场脉搏 gauge，显示 0-100 分和偏弱/中性/偏强。

**独立验证方式**: 组件测试能找到“市场脉搏”、分数、状态和“如何计算？”。

### 测试任务

- [ ] T033 [US3] 在 `src/App.test.jsx` 写失败测试，确认市场脉搏 gauge 展示分数、状态和解释入口

### 实现任务

- [ ] T034 [US3] 创建 `src/components/MetricExplanation.jsx`，使用 button 展开中文解释
- [ ] T035 [US3] 修改 `src/pages/DashboardHome.jsx`，计算并渲染市场脉搏 gauge，使 T033 通过

**检查点**: 用户可看到市场脉搏和解释入口，解释包含“不构成交易建议”。

## 9. Phase 6：用户故事 4 - 市场风格（优先级：P1）

**目标**: 首页展示市场风格标签：科技股领涨、蓝筹股领涨、走势均衡或整体偏弱。

**独立验证方式**: 组件测试能找到“市场风格”和一个合法中文标签。

### 测试任务

- [ ] T036 [US4] 在 `src/App.test.jsx` 写失败测试，确认市场风格标签和解释入口可见

### 实现任务

- [ ] T037 [US4] 创建 `src/components/MarketStyleCard.jsx`，展示市场风格标签和解释
- [ ] T038 [US4] 修改 `src/pages/DashboardHome.jsx`，接入 `calculateMarketStyle` 并渲染市场风格，使 T036 通过

**检查点**: 市场风格不混入 Fear & Greed 算法，只作为独立 derived metric 展示。

## 10. Phase 7：用户故事 5 - 数据时效（优先级：P1）

**目标**: 顶部 bar 展示首页状态、最后更新时间、数据延迟 15 分钟/实时状态、市场状态和 WebSocket 连接状态。

**独立验证方式**: 组件测试能找到“首页”、“数据延迟 15 分钟”或实时状态、market status、connection status。

### 测试任务

- [ ] T039 [US5] 在 `src/App.test.jsx` 写失败测试，确认顶部 bar 展示首页、最后更新时间、数据延迟/实时状态、市场状态和连接状态

### 实现任务

- [ ] T040 [US5] 创建 `src/components/TopBar.jsx`，展示应用名称、首页、last updated、data delay、market status、connection status
- [ ] T041 [US5] 修改 `src/pages/DashboardHome.jsx`，渲染 `TopBar`，使 T039 通过

**检查点**: 首页明确表达数据时效和 WebSocket 状态，避免误解为无延迟交易工具。

## 11. Phase 8：用户故事 6 - Metric 解释（优先级：P1）

**目标**: 每个自定义 metric 有中文解释入口，并说明不是交易建议。

**独立验证方式**: 点击“如何计算？”后能看到输入、计算/阈值概览和“不构成交易建议”。

### 测试任务

- [ ] T042 [US6] 在 `src/App.test.jsx` 写失败测试，确认点击至少一个“如何计算？”后展示中文解释和免责声明

### 实现任务

- [ ] T043 [US6] 修改 `src/components/GaugeCard.jsx`、`src/components/MarketStyleCard.jsx` 和 `src/components/MetricExplanation.jsx`，统一解释交互，使 T042 通过

**检查点**: 解释入口支持键盘点击，解释内容不遮挡核心页面。

## 12. Phase 9：用户故事 7 - Fear & Greed（优先级：P1）

**目标**: 首页在有 API/cache 数据时展示 Fear & Greed gauge、组件分数、权重和说明；无有效数据时隐藏模块。

**独立验证方式**: 组件测试可以通过 mock service 验证有数据时显示、无数据时隐藏；service 测试验证 15 分钟 cache。

### 测试任务

- [ ] T044 [US7] 在 `src/App.test.jsx` 写失败测试，mock Fear & Greed data 时页面展示“恐惧与贪婪”、分数、状态和组件
- [ ] T045 [US7] 在 `src/App.test.jsx` 写失败测试，Fear & Greed data 为 null 时页面不展示该模块

### 实现任务

- [ ] T046 [US7] 创建 `src/components/FearGreedCard.jsx`，展示总分、状态、组件分数、权重、raw 和 cache 更新时间
- [ ] T047 [US7] 修改 `src/pages/DashboardHome.jsx`，通过 `fearGreedService` 异步加载数据，有数据时渲染 `FearGreedCard`，无数据时隐藏，使 T044/T045 通过

**检查点**: Fear & Greed API 不可用时页面仍可使用，且不会显示 fallback 估算。

## 13. 最终阶段：打磨与验证

- [ ] T048 修改 `src/App.css` 和 `src/index.css`，完成响应式 dashboard 视觉、颜色状态、卡片布局和移动端适配
- [ ] T049 确认 `src/pages/DashboardHome.jsx` 页面底部或 metric 解释中包含“本页为市场状态摘要，不构成交易建议”
- [ ] T050 确认 `.env.example` 存在且没有真实 Massive API key

## 14. Phase 10：用户故事 8 - 顶部中英文切换（优先级：P0）

**目标**: 顶部 bar 支持 `中文` / `English` 切换。默认中文；切换后核心 UI 文案、状态标签、解释入口、metric 解释和免责声明同步切换；行情数值和图表数据不变化，不重新请求市场数据。

**独立验证方式**: `npm test` 中本地化 utility 测试和首页组件测试能覆盖默认中文、切换 English、切回中文、当前语言视觉状态，以及切换前后核心数值不变。

### 测试任务

- [ ] T051 [US8] 创建 `src/i18n/dashboardCopy.test.js`，覆盖中文/英文核心文案、状态 label、metric 解释和免责声明
- [ ] T052 [US8] 修改 `src/App.test.jsx`，写失败测试确认默认中文、点击 English 后英文文案可见、点击中文后恢复中文
- [ ] T053 [US8] 修改 `src/App.test.jsx`，写失败测试确认切换语言前后 SPY/QQQ/DIA/VIX 数值、百分比和 gauge 分数保持不变，且不因语言切换重新请求远程数据

### 实现任务

- [ ] T054 [US8] 创建 `src/i18n/dashboardCopy.js`，集中维护 `zh` / `en` 文案、状态映射、指数名称、metric 解释和免责声明
- [ ] T055 [US8] 修改 `src/pages/DashboardHome.jsx`，持有 `language` state，默认 `zh`，把当前语言文案传给子组件
- [ ] T056 [US8] 修改 `src/components/TopBar.jsx`，渲染语言切换控件并用 `aria-pressed` 表达当前语言
- [ ] T057 [US8] 修改 `src/components/IndexCard.jsx`、`src/components/LineChart.jsx`、`src/components/GaugeCard.jsx`、`src/components/MarketStyleCard.jsx`、`src/components/FearGreedCard.jsx` 和 `src/components/MetricExplanation.jsx`，使用当前语言文案
- [ ] T058 [US8] 修改 `src/App.css`，为顶部语言 segmented control 添加响应式样式

**检查点**: 英文模式下能看到 `Home`、`Last updated`、`Data delayed 15 minutes`、`Market Pulse`、`VIX Risk`、`Market Style`、`How is this calculated?` 和英文免责声明；中文模式恢复原有文案。

## 15. 最终验证

- [ ] T059 Run `npm test`
- [ ] T060 Run `npm run build`
- [ ] T061 Run `npm run lint`

## 16. 依赖与执行顺序

- Phase 1 必须先完成。
- Phase 2 是基础能力，必须在主要 UI phase 前完成。
- Massive WebSocket adapter 和 hook 是 US1 的前置依赖。
- Phase 3 到 Phase 8 可以在 Phase 2 后按顺序执行；其中组件文件不同，但 `src/pages/DashboardHome.jsx` 是共享集成点，建议不要并行修改。
- Phase 9 依赖 `GaugeCard`、`MetricExplanation`、Fear & Greed service/cache/api utilities。
- Phase 10 依赖已存在的 dashboard UI 组件和状态 key；建议在原有 MVP UI 通过后执行。
- Final Phase 必须最后执行。
- 可并行任务仅限标记 `[P]` 的测试或数据/utility 文件，且不得同时修改 `src/pages/DashboardHome.jsx`。

## 17. MVP 范围

- MVP 必须完成 T001-T061。
- 优先级最高的最小可见切片是 T004-T029：mock 初始数据 + Massive WebSocket adapter/hook + 三大指数卡片 + line chart。
- 第二个切片是 T005-T035：VIX 风险 + 市场脉搏。
- 第三个切片是 T021-T025 和 T044-T047：Fear & Greed API/cache + 隐藏逻辑。
- 第四个切片是 T051-T058：顶部中英文切换。
- 不做 Massive REST 作为主要行情来源、watchlist、sector snapshot、market breadth。
- 不实现后端 WebSocket proxy；若要共享部署，后续单独创建技术方案。

## 18. 验证命令

- `npm test`
- `npm run build`
- `npm run lint`
