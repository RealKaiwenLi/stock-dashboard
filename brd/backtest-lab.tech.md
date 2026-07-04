# 策略回测实验台多规则配置技术方案

## 背景

用户反馈当前页面把 `Hist > 0` 做成“退出附加条件” checkbox，不符合策略配置心智。它应该和“跌破均线”“MACD 死叉”等一样是退出规则列表中的普通条件。入场规则也需要同样支持多条规则，并由用户选择 `AND` 或 `OR`。

## 技术方案

- 不引入新依赖。
- 前端策略 payload 从单规则对象逐步演进为规则组：
  - `entry: { logic: "and" | "or", rules: Rule[] }`
  - `exit: { logic: "and" | "or", rules: Rule[] }`
- 保留兼容：
  - 前端初始化时可读取旧结构 `{ type, ...params }`。
  - 后端 `/api/backtests` 同时接受旧结构和新结构。
  - 旧的 `exit.requirePositiveHist` 迁移为 `exit.rules` 中的 `{ type: "hist_positive", fast, slow, signal }`。
- UI 新增可复用规则组编辑器：
  - 入场规则组：支持 `macd_cross`、`price_above_ma`、`price_breakout`。
  - 退出规则组：支持 `ma_break`、`macd_cross_down`、`price_breakdown`、`hist_positive`。
  - 每组至少保留 1 条规则。
  - 每条规则显示类型 select、对应参数、删除按钮。
  - 规则组显示 `AND` / `OR` select。
- 后端新增规则求值 helper：
  - 单条规则返回 `(label, series, latest_value)`。
  - 规则组按 `AND` / `OR` 聚合。
  - 最新信号 checklist 直接由规则组 diagnostics 生成。

## 文件计划

- `brd/backtest-lab.md`: 更新产品需求，明确 `Hist > 0` 是普通退出规则。
- `brd/backtest-lab.tech.md`: 本技术方案。
- `brd/backtest-lab.tasks.md`: TDD 执行清单。
- `src/services/backtestService.js`: 更新默认策略数据结构和创建策略逻辑。
- `src/pages/BacktestLabPage.jsx`: 添加规则组编辑器，替换 Hist checkbox。
- `src/pages/BacktestLabPage.test.jsx`: 覆盖多规则 UI 和新 payload。
- `src/i18n/dashboardCopy.js`: 更新中英文文案。
- `src/App.css`: 补充规则组布局样式。
- `backend/app.py`: 支持新规则组 payload 并兼容旧 payload。

## 测试策略

- 前端组件测试：
  - 默认中文页面不再出现“退出附加条件：Hist > 0” checkbox。
  - 默认退出规则列表包含“收盘价跌破均线”和“Hist > 0”。
  - 用户可添加入场规则、选择 OR，并运行回测；提交 payload 包含 `entry.rules`。
  - 用户可添加退出规则、选择 OR，并运行回测；提交 payload 包含 `exit.rules`。
- 后端目前没有 Python test harness，本次用前端 payload 兼容和 Python syntax check 覆盖基础风险。
- 完成后运行：
  - `npm test`
  - `npm run build`
  - `npm run lint`
  - `python3 -m py_compile backend/app.py`

## 风险

- 旧结果解释文案仍可能来自后端英文字符串，前端会继续做轻量本地化。
- 后端对 `Hist > 0` 的 MACD 参数默认取入场 MACD 参数；如果入场不是 MACD，则使用 12/26/9。
- 当前交易记录 `Reason` 仍是 Entry signal / Exit signal，后续可扩展为触发规则组摘要。

## Open Questions

- `Hist > 0` 是否也应该作为入场规则类型开放？本次按 PM 需求只把它作为退出规则普通条件处理，避免策略语义突然变宽。
