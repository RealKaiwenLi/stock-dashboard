# 项目上下文

## 产品定位

本仓库是一个持续开发中的股票 Dashboard，同时包含相关自动化、策略研究与部署代码，已经不再是 Vite 初始模板。

当前产品能力包括：

- 通过日历浏览每日推荐历史。
- 查看每周回测内容，并对结果表格排序。
- 使用通用的多候选策略回测实验台。
- 在浏览器本地保存实验和收藏策略。
- 管理观察列表并查看个股详情。
- 使用中文或英文界面。

## 产品路由

- `/`：每日推荐与每周回测结果。
- `/watchlist`：用户保存在本机的观察列表。
- `/backtest`：可配置的策略比较与诊断实验台。
- `/stocks/:ticker`：个股报价、图表、摘要与指标详情。

路由定义在 `src/App.jsx`，并统一渲染在 `AppShell` 中。

## 运行架构

### 前端

- 使用 Vite 和 React。
- 使用 React Router 管理页面路由。
- 使用 Vitest、React Testing Library 和 jsdom 进行前端测试。
- 所有面向用户的中英文文案集中维护在 `src/i18n/translations.js`。

### 本地 API

- `backend/app.py` 提供 Flask 开发 API。
- Vite 将 `/api/*` 代理到 `http://127.0.0.1:5001`。
- Flask API 负责仅限后端使用的集成和日线策略回测。

### 生产 API

- 项目通过 Sites 部署，并复用 `.openai/hosting.json` 中已有的项目。
- `npm run build` 构建 Vite 应用，并通过 `scripts/create-sites-worker.mjs` 生成生产 Worker 入口。
- `scripts/sites-worker-runtime.js` 实现生产环境 API 路由。
- Flask 与生产 Worker 共有的回测行为必须保持一致。修改回测语义时，应同步更新跨运行时 fixtures 和测试。

## 数据来源与持久化

- Notion 存储每日推荐和每周策略验证结果；Notion 凭证只能存在于后端环境。
- Yahoo Finance 日线用于策略回测和研究。
- Massive 市场数据服务支持报价、K 线、搜索和流式行情相关的前端能力。
- CAPE 历史数据由回测后端读取，并在延迟后才允许影响交易判断。
- Fear & Greed 数据通过独立服务读取，并在本地缓存。
- 浏览器 `localStorage` 用于观察列表、指标偏好、策略收藏、已保存实验和其他设备本地偏好。
- `outputs/` 存放生成的研究与自动化产物，不纳入版本控制。

## 核心回测约定

- 策略信号只能使用相应收盘时点已经可见的信息。
- 收盘后生成的交易指令在下一可用交易日开盘执行。
- 策略配置在校验和执行前必须完成版本化与规范化。
- 退出后冷却、暂存信号、释放验证、待执行订单和实际持仓必须使用同一套对齐后的交易日序列。
- 研究结果不会直接修改生产持仓；生产策略变更仍需遵循 BRD、技术规划和 TDD 流程。

具体功能行为应写入对应的 `brd/` 文档，而不是写在本文件中。

## 自动化

- `.github/workflows/nasdaq-guide.yml` 在符合条件的 NYSE 交易日运行每日 Nasdaq guide 信号流程，并通过配置好的 Notion 集成写入结果。
- `.github/workflows/weekly-strategy-validation.yml` 运行每周策略验证并生成报告产物。
- 自动化配置和可复用的策略验证代码位于 `scripts/`。

## 目录地图

- `src/`：React 页面、组件、hooks、services、翻译和前端测试。
- `backend/`：Flask API、Notion adapter、后端 fixtures 和 Python 测试。
- `scripts/`：生产 Worker 生成与运行代码、定时自动化和可复用策略验证代码。
- `scripts/research/`：可复现研究脚本及其聚焦的 Python 测试。
- `docs/research/`：研究报告、假设、验证结果和已知限制。
- `brd/`：产品需求、技术方案和按依赖排序的实现任务。
- `.github/workflows/`：定时及手动触发的自动化流程。
- `.openai/hosting.json`：已有 Sites 项目的绑定。

## 验证方式

根据改动范围运行相应检查：

- `npm test`：前端组件、services、i18n 和 Worker 测试。
- `npm run build`：生产前端及 Worker 构建。
- `npm run lint`：JavaScript 和 React lint。
- `python3 backend/test_app.py`：Flask 后端测试。
- `python3 scripts/research/test_post_exit_reentry_candidates.py`：退出后再入场研究模拟器测试。

不要在这里记录固定测试数量，因为测试数量会随着项目增长而变化。

## 文档边界

- `AGENTS.md` 定义工作流、权限、角色边界和长期工作约定。
- `docs/project-context.md` 描述当前系统的稳定事实。
- `brd/<feature>.md` 定义功能级产品行为。
- `brd/<feature>.tech.md` 和 `brd/<feature>.tasks.md` 定义实现方案和执行顺序。
- `docs/research/` 保存策略证据与研究结论，不作为生产需求来源。

项目沟通和文档默认使用中文；代码、命令、schema、文件名和路径保持英文。
