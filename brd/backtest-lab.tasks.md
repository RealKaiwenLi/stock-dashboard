# 策略回测实验台：通用退出后再入场策略任务清单

## 执行规则

- TDD agent 必须先读 `brd/backtest-lab.md` 与 `brd/backtest-lab.tech.md`。
- 按依赖顺序执行。只有标记 `[P]` 的任务可在其前置任务完成后并行。
- 每个行为任务先补失败测试，再写最小实现，再运行相关测试。
- 不新增依赖，不为特定 ticker、指标或 14/5 参数写专用分支。
- 不修改 `research.md`。

## 阶段 A：固定现有行为与配置契约

### T001 建立 disabled 基线回归夹具

- 在 `backend/fixtures/post_exit_reentry_cases.json` 添加确定性 OHLC 和现有策略案例。
- 在修改交易循环前记录缺少 `postExitReentry` 时的 trades、equity、summary 和旧 latestSignal 期望。
- 给 `backend/test_app.py` 添加失败测试，证明：
  - 缺字段等价于关闭；
  - disabled 且带无效草稿字段时不读取这些字段；
  - 不产生冷却、暂存或释放事件。

验收：测试先对尚未实现的新 additive 字段失败，但旧结果 fixture 与当前引擎一致。

### T002 实现前端 v2 策略 schema 与迁移

- 新建 `src/services/backtestStrategyConfig.js` 及测试。
- 实现 `configVersion: 2`、`postExitReentry.schemaVersion: 1`、默认 off。
- 旧配置缺字段时迁移为 off；未知未来版本明确报错。
- 规范化深拷贝并保留 disabled 草稿字段，不包含运行时状态。
- 更新 `src/services/backtestService.js` 默认策略与 `createStrategy` 使用规范化器。

验收：旧、新、复制和未知版本测试通过。

### T003 定义路径化配置校验

- 先为 empty、小数、0、253、NaN/Infinity 等值添加失败测试。
- 实现 cooldown/retention 1–252 整数校验。
- 实现 inactive 字段短路：ignore 不校验 retention/release；非 rule_group 不校验隐藏 group。
- 实现 release group 非空、规则参数、asset role 和 fallback CASH 校验。
- 不要在输入 onChange 时用 `Number()` 抹掉非法草稿；只在校验/序列化边界转换。

验收：返回稳定 `{ path, code, messageKey }`，可定位到具体规则行。

## 阶段 B：Flask 权威状态机

### T004 重构原始规则 evaluator 并锁定兼容

- 在 `backend/test_app.py` 为现有每种 entry/exit rule 添加固定序列测试。
- 将未知 rule type 的默认 fallback 改为明确错误。
- 拆分 event rule、state rule 和 group 聚合 helper。
- 原始 entry/exit 继续使用 event 语义，disabled 回归 fixture 不变。

验收：现有规则测试、CAPE 测试和 T001 基线全部通过。

### T005 实现 server-side schema 规范化和候选校验

- 添加缺字段/off、v1/v2、未知版本和非法 active 字段测试。
- disabled 路径不读取历史无效字段。
- active 校验错误包含稳定 code/path/message。
- release asset role 只允许 signal/risk/fallback，fallback CASH 规则明确报错。

验收：服务端不依赖前端规范化即可安全解释旧 payload。

### T006 实现显式订单模型与成交事件

- 用 `OrderState` 替换字符串 pending。
- 保留 T close / next aligned open 的收益计算。
- trades 添加 source signal、scheduled、release、execution price 和 deferred 标记。
- events 添加稳定 sequence 与 `Entry Executed`/`Exit Executed`/`Order Scheduled`。
- 明确 `actualHolding` 与 `nextTarget`，保留旧响应字段。

验收：普通 disabled 策略交易与绩效不变；信号、指令和成交日期可区分。

### T007 实现冷却启动与交易日计数（US9）

- 先添加退出 T、成交 E、E=0、后续 1..N、最后冷却日新信号测试。
- 只有 exit-rule-originated 的 Risk -> Fallback/CASH 实际成交启动。
- 未成交退出、no-op、CAPE risk-filter switch 不启动。
- 使用对齐行 index 计数，不使用自然日。
- 写 `Cooldown Started` 和结构化进度。

验收：US9 全部 Given/When/Then 在 Python 测试中可复现。

### T008 实现 ignore 模式（US10）

- 添加冷却内 entry signal 测试。
- 写 `Entry Ignored`，不创建 deferred signal 或订单。
- 冷却结束不能消费被忽略信号，必须等待新正常 entry。

验收：事件、交易和 latest runtime state 一致。

### T009 实现单槽 retain/replace（US11）

- 添加信号 S 保留 R 日、S2 替换、同日多子条件只形成一个信号测试。
- 实现 `validThroughIndex = S + R - 1`。
- 写 `Signal Retained`/`Signal Replaced`，新信号重置有效期。
- latest state 返回 signal date、valid through、剩余交易日。

验收：只有一个 deferred slot，事件关联旧/新信号正确。

### T010 实现到期边界（US12）

- 添加最后有效日早于冷却结束、下一有效日才 Expired 的测试。
- 添加最后有效日等于最后冷却日的测试。
- 同日先 release validation，只有未生成订单时结束为 expired/rejected。
- 数据尾部不足时返回 out-of-range，不伪造到期事件。

验收：US12 边界与事件顺序固定。

### T011 实现三种 release validation（US13）

- `signal_still_valid`：不重新求 entry。
- `revalidate_entry`：在 release 日原样求完整 entry event group。
- `rule_group`：支持 3.3 的八种 current-state rules、asset role 与 AND/OR。
- 写每条 condition snapshot、汇总、Passed/Rejected。
- rejected 清槽且不自动复检。

验收：金叉未在释放日重现时 revalidate 失败；对应 state rule 可以通过。

### T012 添加无前视测试

- 对每种 current-state rule 修改释放日之后的 OHLC。
- 断言释放日 snapshot、通过结果和订单不变。
- 覆盖 rolling high/low、MA、MACD/Hist。

验收：任何未来数据变化都不影响当日判断。

### T013 实现 T+1、去重和尾部 order pending（US14）

- 添加 release 日 R 只产生 Release Passed + Order Scheduled 的测试。
- 下一条对齐日线开盘才产生交易；无下一行时保持 order_pending。
- release 与当日新 entry 同向时只生成一条订单并关联两个来源。
- 用参与资产日期审计标记因 inner join 缺数造成的顺延。

验收：signalDate、releaseDate、scheduledDate、executionDate 不混淆。

### T014 扩展结果、事件和候选错误隔离

- summary 增加 deferred/expired/rejected counts。
- latestSignal 增加结构化 postExitReentry runtime state。
- 返回完整 events，保持 API 正序。
- 单候选非法返回 `status:error`，其他候选继续；共享错误仍阻塞请求。
- 更新 `backend/README.md`。

验收：混合成功/失败候选 API 测试通过，旧成功字段仍存在。

## 阶段 C：生产 Worker parity

### T015 [P] 在 Sites Worker 实现同语义 schema、规则和状态机

前置：T014。

- 修改 `scripts/sites-worker-runtime.js`，镜像 T004–T014 的行为。
- 导出纯 helper 供 Vitest 使用，不改变 Worker 默认 export。
- 新建 `scripts/sites-worker-runtime.test.js`，读取同一个 JSON fixture。
- 覆盖 disabled、US9–US14、invalid candidate 和 no-lookahead。
- 对 shared fixture 断言 Worker 的 trades/events/equity/counts/latest state 与期望一致。

验收：生产 `/api/backtests` 不依赖 Flask 也能通过同一契约测试。

## 阶段 D：前端配置与持久化

### T016 [P] 更新中英文文案和基础样式

前置：T003。

- 在 `src/i18n/dashboardCopy.js` 增加配置、摘要、校验、状态、事件、tabs 和结果列文案。
- 扩展 i18n 测试，保证 zh/en key 对齐。
- 在 `src/App.css` 增加再入场折叠区、字段错误、状态网格、事件 tabs/table 的桌面与移动样式。

验收：无硬编码 QQQ/TQQQ、MACD 或固定 14/5 文案。

### T017 实现通用再入场配置编辑器

前置：T003、T016。

- 在 `BacktestLabPage.jsx` 的退出规则后增加独立折叠区。
- 实现 enabled、cooldown、ignore/retain、retention、三种 release mode。
- 实现独立 `ReleaseRuleGroupEditor`：asset role、current-state type、参数、AND/OR。
- inactive 字段正确隐藏/disabled。
- 实时摘要通过纯配置函数生成。

验收：组件测试覆盖条件显隐、修改、规则排序和通用 payload。

### T018 实现候选级前端校验和错误定位（US16）

前置：T017。

- 运行前逐候选校验。
- 非法候选卡片与字段旁显示错误，合法候选仍可运行。
- API 返回的候选 error 映射到相同路径。
- 结果表可显示失败候选，不渲染其曲线或明细。

验收：US16 所有 active/inactive 和非法数值场景通过。

### T019 扩展收藏与复制 round trip（US15）

前置：T002、T017。

- 扩展 `strategyFavorites.js` envelope/version/fingerprint。
- 旧 v1 收藏迁移为 post-exit disabled。
- 收藏/加载/复制逐字段恢复 schema、规则顺序和 AND/OR。
- 生成新的 live id，但不保存运行时 state/events/order。

验收：service 与页面测试证明摘要和配置 round trip 一致。

### T020 实现本地实验保存/加载（US15）

前置：T019。

- 新建 `backtestExperiments.js` 及测试。
- 保存共享设置、最多 5 个策略、顺序、配置版本、createdAt/updatedAt 和可选摘要。
- 页面增加保存实验和加载入口。
- 不保存 cooling progress、deferred signal、pending order 或 events。
- 损坏/未知版本对象隔离处理。

验收：重新加载后配置一致，运行时状态为空，必须重跑才能恢复结果。

## 阶段 E：前端结果解释

### T021 扩展排名与当前信号

前置：T014、T017。

- 排名表增加 Deferred、Expired/Rejected、actual holding 和 next target。
- 当前信号展示 enabled/disabled、phase、冷却起点/进度、最早释放日、deferred signal、release conditions、pending order、next action。
- 结构化渲染新字段；旧响应使用 fallback。
- 明确区分“信号出现、释放允许、订单已生成、已经成交”。

验收：US8、US11、US13、US14 的页面解释测试通过。

### T022 实现交易/事件明细 tabs

前置：T014、T016。

- 交易表展示 source signal、release、scheduled、execution 和 deferred。
- 增加策略事件表、event type filter、日期 + sequence 倒序。
- 暂存/替换/到期/拒绝只出现在事件表。

验收：事件筛选、排序和交易/非交易分离测试通过。

## 阶段 F：完整验证

### T023 执行 US8–US16 验收矩阵

- 对照 BRD 每条 Given/When/Then 标记对应自动化测试。
- 确认 Python 与 Worker 共享 fixture 均覆盖所有时间边界。
- 确认 disabled 缺字段与显式 off 的旧输出回归。
- 确认 release rules 对未来数据不敏感。
- 确认 localStorage、收藏、复制和实验加载不恢复运行时。

验收：不得用窄测试替代整条用户故事。

### T024 运行最终验证

```bash
python3 -m unittest discover -s backend -p 'test_*.py'
npm test
npm run build
npm run lint
git diff --check
```

- 删除 Python 检查产生的 `__pycache__` 和 `.pyc`。
- 检查 git diff，确保没有修改 `research.md` 或引入新依赖。
- 在交付摘要中列出测试数量、实现语义和任何仍存在的风险。
