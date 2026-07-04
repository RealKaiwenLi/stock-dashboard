# 首页每日推荐持仓日历 BRD

## 1. 背景与机会

项目现在已经有每日“纳斯达克指引”脚本，会基于 QQQ 信号计算次日开盘应持有的资产，并把结果上传到 Notion。用户希望 webapp 能读取这些每日推荐，不再只在 Notion 里查看静态报告，而是在首页直接看到一个按日期组织的持仓日历。

这个功能的核心价值不是新增一个复杂页面，而是把“今天/最近几天应该持有什么”放到 dashboard 第一屏或首页主要区域，让用户打开应用就能理解当前策略状态，并能回看每日推荐历史。

## 2. 产品定位

功能名称：

- 中文：每日推荐持仓日历
- 英文可选：Daily Recommendation Calendar

一句话：

- 首页展示从 Notion 同步来的每日纳斯达克指引，让用户用日历方式查看每天推荐持仓、次日动作和触发原因。

核心原则：

- 首页优先：不新建独立 calendar tab，作为首页 dashboard 的一个模块。
- Notion 作为来源：P0 只读取现有每日指引 Notion 数据，不在前端重新计算信号。
- 可追溯：每个日期都能看到推荐来自哪份 Notion 报告，以及主要指标。
- 不暴露密钥：前端不能直接访问 Notion API；必须通过 backend proxy。
- 不下单：只展示研究和指引，不提供交易执行。

## 3. 目标用户与场景

目标用户：

- 项目 owner 本人。
- 已经在使用每日纳斯达克指引和每周策略回测。
- 希望把 Notion 自动报告变成 webapp 里的可浏览数据。

核心场景：

1. 用户打开首页，立即看到最新推荐持仓，例如 `QQQ`、`QLD` 或 `TQQQ`。
2. 用户想知道最近几天有没有发生切换，例如从 `QLD` 退回 `QQQ`。
3. 用户想点某一天，查看该日推荐的 MACD、Signal、Hist、EMA 和触发原因。
4. 用户想从每日推荐继续进入 backtest，后续把表现好的策略加入实验台或策略库。

## 4. 问题定义

要解决的问题：

- 首页缺少策略层面的“今日应该持有什么”的摘要。
- 每日推荐目前在 Notion 报告里，查看成本比打开 dashboard 高。
- 历史推荐缺少日历视图，用户难以快速看出持仓状态连续性和切换日期。
- 前端不能安全地直接读取 Notion token，需要 backend API 做中间层。

不解决的问题：

- P0 不改变每日推荐的计算逻辑。
- P0 不支持用户在 webapp 内编辑 Notion 数据。
- P0 不做多策略日历并列比较。
- P0 不做交易提醒、推送通知或券商下单。
- P0 不把每周回测结果接入首页；本 BRD 只覆盖每日推荐。
- P0 不做“从日历一键添加策略到 backtest”，但数据结构要为后续支持保留空间。

## 5. 数据来源与数据契约

P0 数据来源：

- Notion database 中 `报告类型 = 纳斯达克指引` 的页面。
- 现有脚本：`scripts/nasdaq_guide_signal.py`。

现有 Notion 页面属性：

| 属性 | 用途 |
| --- | --- |
| `Doc name` | 页面标题，例如 `2026-07-04 纳斯达克指引 QLD` |
| `Date` | 报告日期 |
| `报告类型` | 固定为 `纳斯达克指引` |
| `Key Tickers` | 当前推荐持仓 |
| `Status` | 页面状态，例如 `Ready` |

页面正文包含：

- 策略名称
- 执行口径
- 数据源
- 信号表
- 判断说明

P0 backend 应返回前端友好的结构，而不是让前端解析 Notion block 细节：

```json
{
  "items": [
    {
      "date": "2026-07-04",
      "latestBarDate": "2026-07-02",
      "recommendedHolding": "QLD",
      "action": "HOLD",
      "holdAfterClose": "QLD",
      "holdForNextOpen": "QLD",
      "modelName": "QQQ/QLD MACD + EMA",
      "signalSymbol": "QQQ",
      "riskSymbol": "QLD",
      "macdParams": "12,26,9",
      "exitEmaLabel": "EMA15",
      "latestClose": 551.23,
      "macd": 1.23,
      "signal": 0.98,
      "hist": 0.25,
      "exitEma": 548.12,
      "signalGoldenCross": false,
      "priceBelowExitEma": false,
      "histPositive": true,
      "fullExitSignal": false,
      "notionUrl": "https://www.notion.so/..."
    }
  ],
  "source": "notion",
  "lastSyncedAt": "2026-07-04T09:00:00-07:00"
}
```

如果某些字段暂时只能从页面正文解析，backend 可以先返回可用字段，并把缺失字段置为 `null`。P0 不要求所有指标字段一次性完整，但必须返回：

- `date`
- `recommendedHolding`
- `action`
- `holdForNextOpen`
- `status`
- `notionUrl`

## 6. 首页模块信息架构

模块位置：

- 放在首页 dashboard 中，优先级高于 watchlist 入口，低于或并列于市场总览。
- 不作为独立 route，不新增顶部 tab。

模块结构：

1. 模块标题：`每日推荐持仓`
2. 最新推荐摘要
3. Calendar month view
4. 选中日期详情
5. Notion 链接

### 6.1 最新推荐摘要

展示：

- 最新报告日期
- 最新完成日线日期
- 推荐持仓
- 次日动作
- 状态标签

示例：

```text
最新推荐：QLD
报告日期：2026-07-04
最新日线：2026-07-02
动作：HOLD
```

### 6.2 Calendar month view

展示：

- 默认显示当前月份。
- 有推荐数据的日期显示持仓 ticker。
- 不同持仓用不同视觉标记：
  - `QQQ`
  - `QLD`
  - `TQQQ`
  - `CASH`
  - 其他 ticker
- 发生切换的日期要比普通 HOLD 更醒目。
- 点击日期后，右侧或下方显示该日期详情。

P0 可以使用项目内 CSS grid 自建月历，不强制引入新 calendar library。

### 6.3 选中日期详情

展示：

- 推荐持仓
- 动作：`HOLD` / `SWITCH_TO_...`
- 当前收盘后状态
- 次日开盘应持有
- MACD / Signal / Hist
- Exit EMA
- 关键条件：
  - 当日金叉
  - 收盘价低于 Exit EMA
  - Hist > 0
  - 完整退出信号
- 判断说明摘要
- 打开 Notion 原文

## 7. 用户故事与验收标准

### US1：首页显示最新每日推荐

作为用户，我打开首页后，希望立即看到最新推荐持仓。

验收标准：

- 首页出现 `每日推荐持仓` 模块。
- 模块显示最新报告日期和推荐持仓。
- 模块显示次日动作。
- 如果数据来自 Notion，模块显示同步状态或最后同步时间。
- 如果无数据，显示空状态，而不是页面报错。

### US2：用户可以用日历查看历史推荐

作为用户，我希望按月份查看每天推荐持有什么。

验收标准：

- 默认显示当前月份。
- 有数据的日期展示推荐持仓 ticker。
- 点击某个有数据日期，会显示该日期详情。
- 日期详情中的推荐持仓与日历格子一致。
- 没有数据的日期显示为空或淡化状态。

### US3：用户可以识别切换日

作为用户，我希望快速看到哪天发生了切换。

验收标准：

- 当 `action` 不是 `HOLD` 时，该日期有明显标记。
- 详情里显示 `SWITCH_TO_QQQ` / `SWITCH_TO_QLD` / `SWITCH_TO_TQQQ` 等动作。
- 用户能看到切换前后持仓字段。

### US4：用户可以查看 Notion 原文

作为用户，我希望需要时能打开对应的 Notion 报告。

验收标准：

- 每条详情提供 Notion 链接。
- 链接指向对应日期的 Notion 页面。
- 如果 Notion 链接缺失，按钮 disabled，并显示数据不完整状态。

### US5：Notion 失败时首页可降级

作为用户，我不希望 Notion API 失败导致首页整体不可用。

验收标准：

- 如果 backend 读取 Notion 失败，首页其它市场模块仍正常展示。
- 每日推荐模块显示错误状态和重试入口。
- 错误文案说明是推荐数据不可用，不应影响市场行情。

## 8. API 需求

P0 backend API：

```text
GET /api/daily-recommendations?from=YYYY-MM-DD&to=YYYY-MM-DD
```

行为：

- 从 Notion database 读取 `报告类型 = 纳斯达克指引` 且日期在范围内的页面。
- 默认范围：当前月份首日到当前月份末日。
- 前端首页首次加载应请求最近 12 个月的范围，减少翻月时的 API 调用。
- 支持前端切换到缓存范围外月份时请求新的 rolling window。
- 返回按日期升序或降序的结构化 JSON；前端排序不依赖 Notion 默认顺序。
- Notion token 和 database id 只能从 backend 环境变量读取。
- backend 对同一日期范围做短 TTL cache，推荐 15 分钟。

可选 P1 API：

```text
GET /api/daily-recommendations/latest
```

用途：

- 首页快速拿最新推荐摘要。
- Calendar 加载前可先展示最新持仓。

## 9. 状态与边界情况

加载中：

- Calendar skeleton 或轻量 loading。
- 最新推荐摘要显示加载状态。

空数据：

- 当前月份没有任何 Notion 指引时，显示“这个月份暂无每日推荐”。

数据延迟：

- 如果最新报告日期不是今天，显示“最新可用推荐来自 YYYY-MM-DD”。
- 不假设周末或假日一定有新报告。

字段缺失：

- 缺少指标字段时隐藏对应指标，不阻塞日历展示。
- 缺少推荐持仓时，该条记录不作为有效日历项展示，并在 debug 或错误信息中标记。

权限错误：

- backend 返回明确错误码，例如 `NOTION_UNAUTHORIZED`。
- 前端显示“Notion 数据暂不可用”。

## 10. 后续扩展

P1：

- 从每日推荐详情一键带入 Backtest Lab。
- 支持 QLD/TQQQ 多策略推荐源。
- 支持按策略名筛选日历。
- 支持显示连续持仓区间，例如连续 12 天持有 QLD。

P2：

- 把每周回测 top strategies 也接入 webapp。
- 做 Strategy Library，把 Notion、weekly validation 和 backtest draft 串起来。
- 支持本地缓存或 SQLite 镜像，减少 Notion API 依赖。

## 11. 非功能需求

安全：

- Notion token 不得进入前端 bundle。
- 前端不得直接调用 Notion API。
- backend 错误日志不得打印 token。

性能：

- 当前月份查询应在可接受时间内完成。
- 建议 backend 可做短 TTL 缓存，但 P0 不强制。

可测试性：

- backend 应有 Notion response adapter 的单元测试。
- 前端应有 calendar render、日期选择、错误状态测试。
- mock 数据必须覆盖 `HOLD` 和 `SWITCH_TO_...` 两类动作。

## 12. 成功标准

- 用户打开首页，可以看到最新每日推荐持仓。
- 用户可以在首页日历回看本月每日推荐。
- 用户可以点开日期查看推荐原因和关键指标。
- Notion 读取失败不会拖垮首页。
- 数据结构能自然扩展到后续“导入 Backtest Lab”。
