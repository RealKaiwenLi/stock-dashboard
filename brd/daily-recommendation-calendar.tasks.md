# 首页每日推荐持仓日历 Tasks

## 1. 执行原则

- 按顺序执行，除非任务标记 `[P]`。
- 不安装新依赖。
- 不暴露 Notion token 到前端。
- 每个行为变化优先加测试。
- 相关验证：`npm test`、`npm run lint`、`npm run build`；后端至少跑 Python syntax check。

## 2. Backend Tasks

- [ ] T001 阅读 `brd/daily-recommendation-calendar.md` 和 `brd/daily-recommendation-calendar.tech.md`。
- [ ] T002 在 `backend/notion_daily_recommendations.py` 创建 Notion API client helper，使用 `urllib.request`、`NOTION_VERSION = "2022-06-28"`、30 秒 timeout。
- [ ] T003 在 `backend/notion_daily_recommendations.py` 实现 `parse_date_range(from_value, to_value, now)`，默认当前月首日至月末，并校验 `from <= to`。
- [ ] T004 在 `backend/notion_daily_recommendations.py` 实现 Notion database query payload builder，过滤 `报告类型 = 纳斯达克指引`、`Date` 在范围内，并按 Date ascending 排序。
- [ ] T005 在 `backend/notion_daily_recommendations.py` 实现分页读取 Notion database pages。
- [ ] T006 在 `backend/notion_daily_recommendations.py` 实现 property parser，读取 `date`、`recommendedHolding`、`status`、`notionUrl`。
- [ ] T007 在 `backend/notion_daily_recommendations.py` 实现 title fallback parser，从 `Doc name` 解析推荐持仓。
- [ ] T008 在 `backend/notion_daily_recommendations.py` 实现 Notion page children reader，用于读取页面正文 blocks。
- [ ] T009 在 `backend/notion_daily_recommendations.py` 实现 signal table parser，把中文 row label 映射为 JSON 字段。
- [ ] T010 在 `backend/notion_daily_recommendations.py` 实现 explanation parser，读取 `判断说明` heading 后的 paragraph。
- [ ] T011 在 `backend/notion_daily_recommendations.py` 实现 `build_daily_recommendations_response(...)`，输出 `{ items, source, lastSyncedAt }`。
- [ ] T011a 在 `backend/notion_daily_recommendations.py` 实现同一日期范围 15 分钟内存 TTL cache。
- [ ] T012 在 `backend/app.py` 添加 `GET /api/daily-recommendations` route。
- [ ] T013 在 route 中处理缺少 Notion env 的 `NOTION_UNCONFIGURED`。
- [ ] T014 在 route 中处理日期错误、Notion 401/403、Notion 网络失败，并返回 BRD 定义错误码。
- [ ] T015 更新 `backend/README.md`，记录 `/api/daily-recommendations`、所需 env 和示例请求。
- [ ] T016 对 backend helper 做 Python syntax check，并删除生成的 `__pycache__`。

## 3. Frontend Service Tasks

- [ ] T017 创建 `src/services/dailyRecommendationsApi.js`，实现 `fetchDailyRecommendations({ from, to, fetchImpl })`。
- [ ] T018 创建 `src/services/dailyRecommendationsApi.test.js`，覆盖成功、非 2xx 错误、query 参数拼接。
- [ ] T019 在 service 或组件内实现纯函数 `getMonthRange(date)`、`getRollingMonthRange(date, 12)`、`rangeIncludesMonth(range, monthDate)`、`mergeDailyRecommendationData(current, incoming)` 和 `buildCalendarDays(monthDate)`，并用测试覆盖当前月、rolling 12 个月、跨月前置空格、闰年和 cache merge。

## 4. Frontend Component Tasks

- [ ] T020 创建 `src/components/DailyRecommendationCalendar.jsx`，先支持静态 data props 渲染。
- [ ] T021 创建 `src/components/DailyRecommendationCalendar.test.jsx`，覆盖标题、最新推荐摘要、日历 ticker 渲染。
- [ ] T022 实现日期选择交互：点击有数据日期显示详情。
- [ ] T023 为 `SWITCH_TO_...` 日期添加可测试的切换标记或 aria label。
- [ ] T024 实现 loading、empty、error 三种状态。
- [ ] T025 实现月份切换按钮和 `onMonthChange` 行为。
- [ ] T026 在详情 pane 展示 Notion 链接；缺失时 disabled。
- [ ] T027 在 `src/App.css` 添加日历模块样式，使用 CSS grid，不使用新 library。
- [ ] T028 检查移动端布局，确保月历和详情不会重叠。

## 5. Homepage Integration Tasks

- [ ] T029 在 `src/i18n/translations.js` 增加 `dailyRecommendations` 中英文翻译。
- [ ] T030 在 `src/pages/DashboardHome.jsx` 接入 daily recommendations state、cached range 和 fetch effect。
- [ ] T031 默认加载最近 12 个月，并默认选中最新有数据日期。
- [ ] T032 切换月份时优先读本地 cache；只有超出 cached range 时才请求新的 rolling window。
- [ ] T033 确保 Notion API 失败时不影响 market summary、Fear & Greed、index cards。
- [ ] T034 更新 `src/App.test.jsx`，覆盖首页出现每日推荐模块和错误降级。

## 6. Verification Tasks

- [ ] T035 运行 `npm test`。
- [ ] T036 运行 `npm run lint`。
- [ ] T037 运行 `npm run build`。
- [ ] T038 运行 Python syntax check：`python3 -m py_compile backend/app.py backend/notion_daily_recommendations.py`。
- [ ] T039 删除 Python syntax check 产生的 `__pycache__`。
- [ ] T040 手动用真实 env 启动 Flask 后验证 `/api/daily-recommendations?from=YYYY-MM-DD&to=YYYY-MM-DD` 能返回 Notion 数据。

## 7. Suggested Slice

第一刀建议只做：

- T002-T007
- T012-T014
- T017-T024
- T029-T034

这能让首页先看到最新推荐和月历。正文 table 的深度指标解析 T008-T010 可以紧接着补上。
