# 首页每周回测技术方案

## 数据流

`DashboardHome -> GET /api/weekly-backtests -> Sites Worker -> Notion 主报告数据库 -> 周报告子数据库`

Worker 查询 `报告类型 = 纳斯达克策略回测` 的主页面，读取页面内 `child_database`，再查询每个子数据库的排名行并归一化为前端 JSON。接口结果使用短 TTL 内存缓存。

## 文件计划

- `scripts/sites-worker-runtime.js`: 新增 `/api/weekly-backtests`、Notion 报告解析和缓存。
- `src/services/weeklyBacktestsApi.js`: fetch adapter 和 payload normalization。
- `src/components/WeeklyBacktestWidget.jsx`: 周次选择、元数据、排序表、状态 UI。
- `src/pages/DashboardHome.jsx`: 删除旧市场 widget orchestration，接入周度回测。
- `src/i18n/dashboardCopy.js`: 新增中英文文案。
- `src/App.test.jsx`、新增 service/component 测试：覆盖首页范围、加载和排序。
- `src/App.css`: 新 widget 桌面与移动端样式。

## 接口

`GET /api/weekly-backtests?limit=12`

返回 `{ items, source, lastSyncedAt }`。每个 item 包含 `reportDate`、`latestBarDate`、`generatedAt`、`title`、`signalSymbol`、`riskSymbol`、`notionUrl`、`dataAudit`、`summary`。

## 风险与降级

- Notion 子数据库读取会产生多次请求；P0 限制最近 12 周并缓存 15 分钟。
- 旧报告若缺少部分元数据，字段返回 `null`，表格仍可展示。
- Notion schema 中动态列名（如 `回撤/QQQ`）按前缀识别。
