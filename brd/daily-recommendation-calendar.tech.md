# 首页每日推荐持仓日历 Technical Plan

## 1. 目标

把 `brd/daily-recommendation-calendar.md` 落成可交给 TDD agent 执行的前后端方案：

- 后端新增安全的 Notion proxy API。
- 前端首页新增“每日推荐持仓”模块。
- 日历展示当前月份每日推荐，点击日期查看详情。
- 不引入新依赖，不暴露 Notion token，不改变每日推荐计算逻辑。

## 2. 现状

已有能力：

- `scripts/nasdaq_guide_signal.py` 已经生成每日“纳斯达克指引”，并写入 Notion。
- Notion 页面属性包含 `Doc name`、`Date`、`报告类型`、`Key Tickers`、`Status`。
- 后端入口是 [backend/app.py](/Users/kaiwenli/Desktop/stock-dashboard/backend/app.py)，目前只有 `/api/backtests` 相关能力。
- Vite dev proxy 已经把 `/api/*` 转到 Flask backend。
- 首页入口是 [src/pages/DashboardHome.jsx](/Users/kaiwenli/Desktop/stock-dashboard/src/pages/DashboardHome.jsx)。
- 翻译集中在 [src/i18n/translations.js](/Users/kaiwenli/Desktop/stock-dashboard/src/i18n/translations.js)。

约束：

- 前端不能直接调用 Notion API。
- Notion token/database id 从 backend 环境变量读取。
- P0 不安装 calendar library。
- P0 不改变 `scripts/nasdaq_guide_signal.py` 的计算逻辑。

## 3. 架构

数据流：

```text
Notion database
  -> Flask backend Notion adapter
  -> GET /api/daily-recommendations
  -> frontend service
  -> DailyRecommendationCalendar
  -> DashboardHome
```

后端职责：

- 读取 `NOTION_TOKEN`、`NOTION_DATABASE_ID`。
- 查询 Notion database 中 `报告类型 = 纳斯达克指引` 且 `Date` 在范围内的页面。
- 把 Notion property 和页面正文尽量转换成稳定 JSON。
- 隐藏 Notion block 复杂度，前端只处理业务字段。

前端职责：

- 请求当前月份数据。
- 生成月历格子。
- 展示最新推荐和日期详情。
- 展示 loading/error/empty 状态。
- 不保存 token，不知道 Notion database id。

## 4. 后端设计

### 4.1 文件计划

新增：

- `backend/notion_daily_recommendations.py`

修改：

- `backend/app.py`
- `backend/README.md`

推荐后续测试文件：

- `backend/test_notion_daily_recommendations.py`

### 4.2 API

```http
GET /api/daily-recommendations?from=YYYY-MM-DD&to=YYYY-MM-DD
```

查询参数：

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `from` | no | 当前月第一天 | 起始日期 |
| `to` | no | 当前月最后一天 | 结束日期 |

成功响应：

```json
{
  "items": [],
  "source": "notion",
  "lastSyncedAt": "2026-07-04T10:20:00-07:00"
}
```

错误响应：

```json
{
  "error": "NOTION_UNCONFIGURED",
  "message": "Notion token or database id is not configured."
}
```

错误码：

| code | HTTP | 含义 |
| --- | --- | --- |
| `INVALID_DATE_RANGE` | 400 | 日期格式错误或 `from > to` |
| `NOTION_UNCONFIGURED` | 503 | 缺少 `NOTION_TOKEN` 或 `NOTION_DATABASE_ID` |
| `NOTION_UNAUTHORIZED` | 502 | Notion 返回 401/403 |
| `NOTION_REQUEST_FAILED` | 502 | Notion 网络或 API 错误 |

### 4.3 Notion 查询

查询条件：

- `报告类型` select equals `纳斯达克指引`
- `Date` on_or_after `from`
- `Date` on_or_before `to`

排序：

- `Date` ascending

分页：

- P0 支持 Notion pagination，循环读取直到 `has_more = false`。

请求实现：

- 使用 Python 标准库 `urllib.request`，保持和现有脚本风格一致。
- `Notion-Version` 使用 `2022-06-28`。
- 请求超时 30 秒。

### 4.4 数据映射

优先从 properties 读取：

| 前端字段 | Notion 来源 | 备注 |
| --- | --- | --- |
| `date` | `Date.date.start` | 报告日期 |
| `recommendedHolding` | `Key Tickers.rich_text` | P0 最低要求 |
| `status` | `Status.select.name` | Ready 等 |
| `notionUrl` | page `url` | 打开原文 |

可从标题 fallback：

- `Doc name` 形如 `2026-07-04 纳斯达克指引 QLD` 时，可解析最后一个 ticker 作为 `recommendedHolding` 的 fallback。

页面正文解析：

- P0 推荐解析 Notion table 中的 `项目 / 数值 / 说明`。
- 将中文 row label 映射为英文 JSON keys。

映射表：

| Notion label | JSON key |
| --- | --- |
| `最新完成日线日期` | `latestBarDate` |
| `最新收盘价` | `latestClose` |
| `当前收盘后状态` | `holdAfterClose` |
| `次日开盘动作` | `action` |
| `次日开盘应持有` | `holdForNextOpen` |
| `MACD` | `macd` |
| `Signal` | `signal` |
| `Hist` | `hist` |
| `当日金叉` | `signalGoldenCross` |
| `当日 Hist > 0` | `histPositive` |
| `当日完整退出信号` | `fullExitSignal` |

Exit EMA label 是动态的，例如 `EMA15`。解析规则：

- label 匹配 `^EMA\d+$` 时：
  - `exitEmaLabel = label`
  - `exitEma = value`
- label 匹配 `收盘价低于 EMA\d+` 时：
  - `priceBelowExitEma = boolean(value)`

判断说明：

- 从 `判断说明` heading 后的 paragraph 合并为 `explanation`。
- P0 可以返回 `null`，但 TDD agent 应优先支持。

### 4.5 缓存

实现轻量内存 TTL：

- key: `from:to`
- ttl: 15 分钟
- 缓存内容不包含 token

前端首次请求最近 12 个月 rolling window，并在本地按日期 merge cache。切换到已缓存月份时不得重新请求 Notion；只有越过缓存边界时才请求新的 rolling window。

## 5. 前端设计

### 5.1 文件计划

新增：

- `src/services/dailyRecommendationsApi.js`
- `src/services/dailyRecommendationsApi.test.js`
- `src/components/DailyRecommendationCalendar.jsx`
- `src/components/DailyRecommendationCalendar.test.jsx`

修改：

- `src/pages/DashboardHome.jsx`
- `src/i18n/translations.js`
- `src/App.css`
- `src/App.test.jsx`

### 5.2 Service

`fetchDailyRecommendations({ from, to, fetchImpl })`

职责：

- 调用 `/api/daily-recommendations?from=...&to=...`
- 非 2xx 抛出带 `code` 的错误
- 返回标准结构 `{ items, source, lastSyncedAt }`
- 支持 `getRollingMonthRange(date, 12)`、`rangeIncludesMonth(range, monthDate)` 和 `mergeDailyRecommendationData(current, incoming)`。

日期工具：

- 可在 service 或 component 内实现：
  - `monthRange(date)`
  - `buildCalendarWeeks(year, month)`
- 不需要引入 date library。

### 5.3 Component

`DailyRecommendationCalendar`

Props：

```js
{
  data,
  loading,
  error,
  selectedDate,
  onSelectDate,
  onMonthChange,
  language,
  copy
}
```

也可以让组件内部自己管理 selected date；TDD agent 可按现有首页模式决定。

UI 结构：

- outer `section`，aria-label 来自 i18n。
- 最新推荐摘要。
- 月份 header：
  - 上月按钮
  - 当前月份 label
  - 下月按钮
- 7 列 calendar grid。
- 日期详情 pane。

交互：

- 默认选中最新有数据的日期。
- 点击有数据日期，更新详情。
- 点击无数据日期不需要显示详情，可保持当前选中或显示空状态。
- 切换月份后重新请求该月数据。

视觉：

- 不用 card 套 card。
- 月历格子使用稳定 grid dimensions，避免 ticker 长度导致 layout shift。
- ticker badge 不用单一紫色主题；建议：
  - `QQQ`: blue
  - `QLD`: green
  - `TQQQ`: amber/red
  - `CASH`: gray
- `SWITCH_TO_...` 日期加边框或小 marker。

### 5.4 首页接入

在 `DashboardHome` 中：

- 新增 `dailyRecommendations` state。
- 默认计算当前月份范围。
- 首次请求最近 12 个月 rolling window。
- 维护本地 cached range 和按日期合并后的 recommendation cache。
- 在 `FearGreedCard` 与 `index-grid` 之间插入日历模块，或放在 summary 后，具体按视觉密度决定。
- Notion 失败时，只让该模块显示 error，不影响市场数据。

### 5.5 i18n

新增 copy namespace：

```js
dailyRecommendations: {
  title,
  latestTitle,
  recommendedHolding,
  reportDate,
  latestBarDate,
  action,
  status,
  source,
  openNotion,
  loading,
  empty,
  error,
  retry,
  previousMonth,
  nextMonth,
  switchDay,
  metrics,
  conditions
}
```

中英文都要补齐。

## 6. 测试策略

前端：

- service test：
  - 成功返回 items。
  - 非 2xx 抛出错误。
  - 正确拼接 from/to query。
- component test：
  - 渲染最新推荐。
  - 渲染月份日历和 ticker。
  - 点击日期显示详情。
  - `SWITCH_TO_...` 日期有切换标记。
  - loading/error/empty 状态。
- App test：
  - 首页出现 `Daily Recommendation Calendar` / `每日推荐持仓`。
  - Notion API 失败时，指数和 gauge 仍正常。

后端：

- 纯函数测试优先：
  - Notion property parser。
  - Notion table row parser。
  - boolean/number/ticker fallback parser。
- Flask route 手动验证：
  - 缺 env 返回 `NOTION_UNCONFIGURED`。
  - 有 env 时可读真实 Notion。

项目目前未配置 backend test runner。Planner 不建议此功能单独引入新依赖；TDD agent 可以先用 Python 标准库 `unittest` 或后续统一引入 `pytest`。

## 7. 风险

- Notion 页面正文 table 不是严格 schema，解析中文 label 有脆弱性。
- 当前每日脚本只把 `Key Tickers` 写到 database property，很多关键指标在 block table 里；如果 block 结构变更，backend 解析要跟着改。
- `scripts/nasdaq_guide_signal.py` 的 upsert date 使用当前 LA 日期，而信号本身使用 latest bar date；Calendar 需要同时展示二者，避免误读。
- Notion API 写入/读取可能较慢，首页模块必须能独立 loading。

## 8. 建议改进

推荐后续把每日脚本写入更多结构化 properties，减少 backend 解析 block 的脆弱性：

- `Recommended Holding`
- `Action`
- `Latest Bar Date`
- `Hold After Close`
- `Hold For Next Open`
- `MACD`
- `Signal`
- `Hist`
- `Exit EMA`

P0 可以先解析现有 Notion 页面；P1 再优化 Notion schema。

## 9. Open Questions

- `NOTION_DATABASE_ID` 当前同时存每日指引和每周回测吗？BRD 假设是同一个 database，用 `报告类型` 区分。
- 每日推荐未来是否会同时支持 QLD 和 TQQQ 两套模型？P0 先按现有每日指引单模型展示。
- 首页默认语言当前测试是英文；中文用户体验是否要把默认语言切为中文？本功能不单独改变默认语言。
