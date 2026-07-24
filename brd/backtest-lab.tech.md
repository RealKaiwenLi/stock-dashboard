# 策略回测实验台：通用退出后再入场策略技术方案

## 1. 方案目标

本方案实现 BRD US8–US16 的 `Post-exit Re-entry Policy`，用于表达通用的：

```text
退出成交
  -> 冷却若干个对齐交易日
  -> 忽略或暂存冷却期内最新入场信号
  -> 冷却结束时按指定方式验证
  -> T 日收盘生成指令
  -> 下一可用交易日开盘成交
```

实现必须只依赖资产角色、规则组、交易事件和对齐后的交易日序列。不得为 QQQ、TQQQ、MACD、14 天冷却或 5 天保留期建立专用分支。

不引入新依赖。继续使用 React、Vitest、Python `unittest`、pandas 和当前 Sites Worker 运行时。

## 2. 当前实现审计

### 2.1 前端

- `src/services/backtestService.js`
  - 默认策略已经采用 `entry.logic/rules` 与 `exit.logic/rules`。
  - 尚无策略 schema 版本，也没有退出后再入场字段或统一迁移入口。
- `src/pages/BacktestLabPage.jsx`
  - 已有通用入场/退出规则组编辑器、候选复制、收藏、结果表、当前信号和交易记录。
  - 数值输入目前直接使用 `Number(...)`，无法可靠保留空值、非数字文本等非法草稿，新增字段需要先保留输入字符串，再在运行边界校验。
  - 当前没有策略事件表、再入场当前状态、候选级错误行或实验保存/加载 UI。
- `src/services/strategyFavorites.js`
  - 收藏使用 `stock-dashboard.strategyFavorites.v1`。
  - 只序列化名称、资产、入场、退出和 CAPE；必须扩展并迁移再入场配置。
- 当前没有完整实验的 localStorage service；BRD 中的“保存实验”尚未实现。US15 需要补齐最小的本地保存/加载能力。
- `src/i18n/translations.js` 和 `src/App.css` 已集中承载 Backtest Lab 翻译和样式，可继续沿用。

### 2.2 Flask 后端

- `backend/app.py` 的 `run_strategy` 使用：
  - `base_risk_on`
  - 单个 `pending` 目标
  - T 日收盘生成目标、下一条对齐日线开盘执行
- `pending` 目前只保存目标与原因，无法区分原始信号日、释放日、指令日和成交日。
- 入场和退出规则都按完整时间序列一次性计算；规则求值隐含使用 `signalAsset`。
- 当前只有交易记录，没有策略事件、再入场运行状态或事件计数。
- `backend/test_app.py` 目前主要覆盖 CAPE，尚未覆盖通用策略状态机。
- `/api/backtests` 当前一个策略报错会使整个请求返回 500，不符合候选级错误隔离。

### 2.3 生产 Sites Worker

- 生产部署并不执行 Flask；`scripts/sites-worker-runtime.js` 内有一份 JavaScript 回测引擎。
- 它和 Flask 的规则与交易循环基本镜像，但目前没有独立测试。
- 本功能必须同时修改 Flask 和 Sites Worker，并使用共享 JSON 场景夹具验证结果语义一致，否则本地正确、线上错误的风险很高。

## 3. 配置 schema

### 3.1 策略配置版本

新的策略配置使用：

```json
{
  "configVersion": 2,
  "postExitReentry": {
    "schemaVersion": 1,
    "enabled": false,
    "cooldownTradingDays": 10,
    "signalHandling": "ignore",
    "retentionTradingDays": 5,
    "releaseValidation": {
      "mode": "revalidate_entry",
      "group": {
        "logic": "and",
        "rules": []
      }
    }
  }
}
```

枚举值：

- `signalHandling`
  - `ignore`
  - `retain_latest`
- `releaseValidation.mode`
  - `signal_still_valid`
  - `revalidate_entry`
  - `rule_group`
- `releaseValidation.group.logic`
  - `and`
  - `or`

版本规则：

- `configVersion` 是整个候选策略的版本；当前新配置写 `2`。
- `postExitReentry.schemaVersion` 只版本化该子结构，当前为 `1`。
- 未知的未来 major 版本必须返回明确的 `UNSUPPORTED_CONFIG_VERSION`，不得猜测解释。
- 配置对象只保存声明式字段，不保存冷却进度、暂存信号、待成交指令或上次回测状态。

### 3.2 向后兼容与规范化

新增 `src/services/backtestStrategyConfig.js` 作为前端唯一的策略配置规范化边界：

- 旧配置缺少 `configVersion` 时按版本 1 读取。
- 旧配置缺少 `postExitReentry` 时规范化为 `enabled: false`。
- 关闭时可以保留用户曾填写的其他字段，便于重新启用，但这些字段不参与前端运行校验或后端计算。
- 规范化必须深拷贝，不能改写 localStorage 原对象或 React state。
- 收藏、复制、保存实验、从收藏添加和发送 API 前都调用同一个规范化函数。

Flask 和 Worker 各自保留一个同语义的 server-side normalizer。服务器不能依赖前端已经迁移：

- 缺字段等价于 `enabled = false`。
- disabled 路径不得读取或验证其他再入场字段。
- 旧配置在相同数据和其余参数下，交易序列、绩效指标、信号安排和原有字段值必须保持不变。
- 新响应字段只能是 additive；不删除或重命名现有成功结果字段。

### 3.3 释放验证规则 schema

释放规则与原始事件规则分开建模，避免把“发生交叉”错误解释为“当前仍在交叉上方”：

```json
{
  "assetRole": "signal",
  "type": "macd_above_signal",
  "fast": 12,
  "slow": 26,
  "signal": 9
}
```

`assetRole`：

- `signal`
- `risk`
- `fallback`

首批通用 current-state 规则：

| Rule type | 语义 | 对应现有事件/状态 |
| --- | --- | --- |
| `macd_above_signal` | 当前 MACD > Signal | `macd_cross` 的持续状态 |
| `macd_below_signal` | 当前 MACD < Signal | `macd_cross_down` 的持续状态 |
| `hist_positive` | 当前 Hist > 0 | 复用现有状态条件 |
| `hist_negative` | 当前 Hist < 0 | Hist 的相反状态 |
| `close_above_ma` | 当前 Close > EMA/SMA | `price_above_ma` 的持续状态 |
| `close_below_ma` | 当前 Close < EMA/SMA | 复用 `ma_break` 语义 |
| `close_above_prior_high` | 当前 Close > 前 N 日最高收盘 | `price_breakout` 的当前阈值状态 |
| `close_below_prior_low` | 当前 Close < 前 N 日最低收盘 | `price_breakdown` 的当前阈值状态 |

约束：

- 原始 entry/exit rule ID 和 release rule ID 不混用，不通过 side 参数偷偷改变同一个 ID 的含义。
- `revalidate_entry` 必须原样求值原始 entry 事件规则。因此释放日没有再次发生金叉时，`macd_cross` 为 false。
- `rule_group` 才使用上述 current-state 目录。
- `assetRole = fallback` 且 fallback 为 `CASH` 时，价格/指标规则非法并定位到对应规则行。
- 所有 rolling、EMA、MACD 计算只使用当前行及更早数据；状态规则不得使用负向 shift 或未来行。

## 4. 后端状态机

### 4.1 运行时对象

把当前 `pending: str` 升级为显式对象，但 disabled 路径保持原交易决策：

```text
PositionState
  heldAsset
  baseRiskOn

OrderState | null
  targetAsset
  kind: entry | exit | risk_filter
  reason
  sourceSignalDate
  scheduledDate
  releaseDate | null

ReentryState
  enabled
  phase:
    inactive | cooling_down | pending_signal |
    ready_for_validation | order_pending
  cooldownStartIndex | null
  cooldownStartDate | null
  cooldownElapsed
  deferredSignal | null
  counters

DeferredSignal
  signalDate
  signalIndex
  validThroughIndex
  validThroughDate | null
  ruleSnapshot
```

只有一个 `OrderState` 和一个 `DeferredSignal` 槽。不得实现队列。

### 4.2 冷却启动条件

冷却必须同时满足：

1. 指令来源是完整退出规则组，即 `kind = exit`；
2. 该指令实际在某个对齐交易日开盘成交；
3. 成交方向为 `Risk Asset -> Fallback Asset/CASH`。

退出信号出现、指令生成但数据结束未成交、同资产 no-op 或 CAPE 风险许可切换均不启动冷却。CAPE 属于独立风险过滤层，不是原始退出规则事件；如未来希望按 CAPE 等不同退出原因配置冷却，属于 BRD P1 的“按退出原因配置”。

### 4.3 每个对齐日线的确定性处理顺序

每个 index 按下列顺序处理：

1. **Open execution**
   - 执行前一收盘已经存在的唯一订单。
   - 计算原持仓隔夜与新持仓日内收益。
   - 写交易记录和 `Entry Executed`/`Exit Executed` 事件。
   - 若符合 4.2，启动冷却，成交日为第 0 日，写 `Cooldown Started`。
2. **Close position/risk state**
   - 仅使用当日收盘及更早数据更新原有 base trend 和 CAPE 状态。
3. **Cooldown update**
   - `cooldownElapsed = currentIndex - cooldownStartIndex`。
   - 成交日收盘仍为 0；后续第 1、2…N 个对齐行分别计 1、2…N。
   - 到 N 时在该日收盘解除限制。
4. **Existing deferred signal lifecycle**
   - 若 `currentIndex > validThroughIndex`，写 `Signal Expired` 并清槽。
   - 若当日是冷却结束日且信号仍有效，进入一次性释放验证。
   - 有效期最后一天与冷却结束同日时先验证；通过则释放，失败则 `Rejected`，不得先标记过期。
5. **Current-day entry event**
   - 计算当日完整 entry 规则组；一个规则组最多形成一个信号。
   - 冷却已在本日结束时，此信号按正常信号处理。
   - 仍在冷却时：
     - `ignore`：写 `Entry Ignored`，不建槽；
     - `retain_latest`：空槽写 `Signal Retained`；有槽写 `Signal Replaced`，有效期从新信号日重算。
6. **Order scheduling**
   - 释放通过或冷却外正常入场只能生成一个 Risk 订单。
   - 同日释放和新信号同时指向 Risk 时去重为一条订单，但事件关联两个来源。
   - 写 `Release Passed`/`Release Rejected` 和 `Order Scheduled`。
   - 本日收盘后实际持仓不变；下一条对齐日线开盘执行。

事件增加单调递增的 `sequence`，并使用 phase order 确保同日稳定排序：

```text
10 trade execution
20 cooldown transition
30 deferred expiry/release
40 current entry signal
50 order scheduling
```

### 4.4 保留期边界

信号日在 index `S`，保留 `R` 个交易日：

```text
validThroughIndex = S + R - 1
```

- `S` 是第 1 日。
- 只有数据中真实存在该 index 时才返回 `validThroughDate`。
- 如果超出数据尾部，返回 `validThroughDate: null`、`validThroughOutOfRange: true`，不得伪造日期。
- 信号在 `validThroughIndex` 收盘仍有效；在下一条对齐日线才产生 `Signal Expired`。

### 4.5 释放验证

- `signal_still_valid`
  - 只检查 deferred signal 尚未过期。
  - 不再次求值 entry 或其他指标。
- `revalidate_entry`
  - 在冷却结束日收盘求值原始完整 entry rule group。
  - 事件型规则必须在该日重新发生。
- `rule_group`
  - 按每条规则的 `assetRole` 读取相应资产收盘序列。
  - 生成每条规则的 `label/value/passed` 及 AND/OR 汇总结果。

失败后写 `Release Rejected`，清除 deferred signal，不在后续日期自动复检。

### 4.6 T+1 与数据尾部

- “T+1”始终表示完成该策略数据对齐后的下一条有效日线，不是自然日。
- 订单保存 `scheduledDate`；若当前数据已到尾部，订单留在 `order_pending`，不写成交。
- 交易记录包含原始信号日、释放判断日和实际执行日。
- 为识别因某参与资产缺数造成的顺延，数据对齐阶段需保留各策略参与资产的日期集合；若 signal asset 的下一有效日期早于下一共同日期，则设置 `executionDeferred: true` 并在事件说明中标注。周末和正常休市不算数据缺口。

## 5. 规则求值重构

Flask 新增清晰的三层 helper：

```text
evaluate_event_rule(seriesByRole, rule, strategy, side)
evaluate_state_rule(seriesByRole, rule, strategy)
evaluate_rule_group(evaluator, group, index?)
```

要求：

- 原始 entry/exit 继续走 event evaluator，保持现有结果。
- release group 只走 state evaluator。
- evaluator 返回完整序列和当日 snapshot；状态机只读取当前 index。
- 参数验证在求值前完成，禁止未知 rule type 静默落入默认 `ma_break`。当前 `evaluate_rule` 的最终 else fallback 必须改成显式类型分支并对未知类型报错。
- Python 和 Worker 使用相同的枚举、默认值、标签字段和 fixture 期望。

## 6. API 契约

### 6.1 候选级错误

共享设置错误仍阻塞整个请求：

- 日期非法
- benchmark 无数据
- 共享数据抓取失败
- 整体对齐区间为空

单个候选配置错误返回该候选的错误结果，不阻塞其他候选：

```json
{
  "id": "strategy-2",
  "status": "error",
  "error": {
    "code": "INVALID_POST_EXIT_REENTRY",
    "path": "postExitReentry.releaseValidation.group.rules[1].window",
    "message": "请输入 1–252 的整数交易日"
  }
}
```

只要共享运行成功，HTTP 状态为 200，即使一个或全部候选配置失败。前端必须展示错误行且不尝试渲染其曲线或交易明细。

### 6.2 成功策略结果

保留所有现有字段，并新增：

```json
{
  "status": "complete",
  "summary": {
    "actualHolding": "FALLBACK_ASSET",
    "deferredEntries": 2,
    "expiredSignals": 1,
    "rejectedSignals": 0
  },
  "latestSignal": {
    "actualHolding": "FALLBACK_ASSET",
    "nextTarget": "RISK_ASSET",
    "postExitReentry": {
      "enabled": true,
      "state": "order_pending",
      "cooldownStartDate": "2026-06-01",
      "cooldownElapsed": 8,
      "cooldownTotal": 8,
      "earliestReleaseDate": "2026-06-11",
      "earliestReleaseOutOfRange": false,
      "deferredSignal": {
        "signalDate": "2026-06-08",
        "validThrough": "2026-06-11",
        "validThroughOutOfRange": false,
        "remainingTradingDays": 0,
        "status": "released",
        "ruleSnapshot": []
      },
      "releaseValidation": {
        "mode": "rule_group",
        "logic": "AND",
        "passed": true,
        "conditions": []
      },
      "pendingOrder": {
        "target": "RISK_ASSET",
        "sourceSignalDate": "2026-06-08",
        "releaseDate": "2026-06-11",
        "scheduledDate": "2026-06-11"
      },
      "nextAction": "execute_next_available_open"
    }
  },
  "trades": [],
  "events": []
}
```

兼容说明：

- `summary.currentHolding`、`summary.latestSignal`、`latestSignal.holding/action/conditions/explanation` 暂不删除。
- `actualHolding` 是收盘后真实已成交持仓；`nextTarget` 是待执行目标。前端新展示使用这两个明确字段，并对旧响应 fallback 到旧字段。
- disabled 策略的原交易逻辑与指标不得因状态机重构变化；使用固定回归 fixture 比较变更前基线。

### 6.3 交易记录

每条交易新增：

```text
sourceSignalDate
releaseDate
orderScheduledDate
executionPrice
executionDeferred
```

继续保留旧 `signalDate`，其值等于 `sourceSignalDate`。普通交易 `releaseDate = null`。暂存/替换/到期/拒绝不是交易，不得放进 `trades`。

### 6.4 策略事件

事件字段：

```text
sequence
eventDate
eventType
holding
cooldownProgress: { elapsed, total } | null
signalDate
validThrough
releaseDate
ruleSnapshot
explanation
```

事件类型至少覆盖：

- `Entry Executed`
- `Exit Executed`
- `Cooldown Started`
- `Entry Ignored`
- `Signal Retained`
- `Signal Replaced`
- `Signal Expired`
- `Release Passed`
- `Release Rejected`
- `Order Scheduled`

结果计数从完整事件流累计，不从前端可见行反推。P0 返回完整事件流；交易和事件表默认倒序只影响展示，不改变 API 顺序。

## 7. 前端方案

### 7.1 配置区

在退出规则之后、CAPE 风险过滤之前增加独立可折叠区：

- Enabled toggle。
- `cooldownTradingDays`。
- `signalHandling`。
- `retain_latest` 时显示保留期和释放模式。
- `rule_group` 时显示独立 `ReleaseRuleGroupEditor`。
- release rule row 包含 asset role、current-state rule type 和对应参数。
- 实时显示纯函数生成的自然语言摘要。
- disabled 显示“退出后再入场限制：关闭”，其他草稿字段隐藏或 disabled。

不要复用当前 `RuleGroupEditor` 后偷偷改变 rule type 语义。可以复用布局组件和数值字段，但 entry/exit 与 release 使用不同的 rule catalog。

### 7.2 校验

新增纯函数 `validateStrategyConfig`，返回路径化错误：

```text
{ path, code, messageKey }
```

前端校验：

- cooldown 和 active retention 均为 1–252 的十进制整数。
- 空值、小数、非数字、非有限值、溢出的科学计数法均非法。
- `signalHandling = ignore` 时不校验 retention/release。
- release mode 非 `rule_group` 时不校验隐藏规则。
- `rule_group` 至少一条规则、参数合法、fallback CASH 不可参与价格规则。
- 错误显示在字段/规则行旁；非法候选标记为 blocked，其他候选仍可发送和运行。

### 7.3 保存、复制与收藏

- `createStrategy`、候选复制继续深拷贝声明式配置。
- `strategyFavorites.js` 保留现有 storage key 以读取旧收藏，并给内部 favorite envelope 增加 `version: 2`。
- fingerprint 必须包含完整 `postExitReentry` 草稿；即使 disabled 也保留字段，确保重新启用后的配置可复现。
- 新增 `backtestExperiments.js`，使用 `stock-dashboard.backtestExperiments.v1` 保存版本化 envelope：
  - 实验共享设置；
  - 最多 5 个规范化策略；
  - 可选最新结果摘要；
  - createdAt/updatedAt。
- 加载、复制和从收藏添加时生成新的 live strategy id，但保持规则顺序、AND/OR 与再入场所有声明式字段。
- 永远不保存 `latestSignal.postExitReentry`、events、deferred signal 或 pending order。

### 7.4 结果区

- 排名表新增 Deferred、Expired/Rejected 和候选错误状态。
- `actualHolding` 与 `nextTarget` 分开展示。
- 当前信号区展示：
  - enabled/disabled；
  - runtime state；
  - 冷却起点和进度；
  - 最早释放日或超出数据范围；
  - deferred signal 日期、有效期、剩余日；
  - release conditions；
  - pending order；
  - next action。
- 明细区增加“交易记录 / 策略事件”tabs。
- 事件表按日期和 `sequence` 倒序，可按 `eventType` 筛选。
- 文案通过结构化字段映射，不新增依赖英文正则的核心状态解析。

## 8. 文件级改动

| 文件 | 计划 |
| --- | --- |
| `src/services/backtestStrategyConfig.js` | 新增 schema 默认值、迁移、深拷贝、摘要和路径化校验 |
| `src/services/backtestStrategyConfig.test.js` | 覆盖版本、旧配置、disabled、非法数值和 release rules |
| `src/services/backtestService.js` | 默认策略写入 v2/off；运行前规范化；保持 API adapter |
| `src/services/strategyFavorites.js` | 收藏 v2、迁移和再入场字段持久化 |
| `src/services/strategyFavorites.test.js` | 覆盖旧收藏、指纹、保存/恢复、不保存运行时 |
| `src/services/backtestExperiments.js` | 新增本地实验保存/加载 |
| `src/services/backtestExperiments.test.js` | 覆盖版本、候选顺序、配置恢复和运行时剥离 |
| `src/pages/BacktestLabPage.jsx` | 配置 UI、候选错误、结果计数、当前状态、事件表、实验保存/加载 |
| `src/pages/BacktestLabPage.test.jsx` | 覆盖 US8、US10、US13、US15、US16 及 API 展示 |
| `src/i18n/translations.js` | 中英文配置、校验、状态、事件和表头翻译 |
| `src/i18n/translations.test.js` | 保证新增 key 两种语言完整 |
| `src/App.css` | 再入场折叠区、错误、状态网格、tabs、事件表响应式样式 |
| `backend/app.py` | schema 校验、event/state rule evaluator、状态机、事件/API 扩展、候选错误隔离 |
| `backend/test_app.py` | Flask 单元与状态机边界测试 |
| `backend/fixtures/post_exit_reentry_cases.json` | Python/Worker 共用的确定性 OHLC、信号和期望事件夹具 |
| `scripts/sites-worker-runtime.js` | 与 Flask 同语义的校验、状态机、API 扩展；导出纯 helper 供测试 |
| `scripts/sites-worker-runtime.test.js` | 读取共用 fixture，验证生产 Worker 行为和 API 错误隔离 |
| `backend/README.md` | 补充 v2 payload、响应和 disabled 兼容说明 |

不得修改 `research.md`，也不得把研究脚本参数硬编码到 Backtest Lab。

## 9. 测试策略

### 9.1 共享确定性 fixture

使用小型手写 OHLC 序列和预先指定的 entry/exit signal override，避免测试依赖 Yahoo、Notion、CAPE 或真实日期。fixture 覆盖：

- 旧/disabled 基线；
- 退出信号 T、退出成交 E、E 为 day 0；
- 周末/缺失共同日期不计数；
- ignore；
- retain、replace、expiry；
- expiry 与 release 同日；
- 三种 release mode；
- release 与同日新 entry 去重；
- T+1、数据尾部 order pending；
- 未成交退出不启动；
- invalid fields；
- current-state rule 无前视。

Python 与 Worker 都读取同一 fixture，并断言：

- trades；
- ordered events；
- equity curve；
- summary counts；
- latest runtime state。

### 9.2 disabled 回归门

在改状态机前先把当前引擎对固定数据的完整成功结果保存为期望 fixture。变更后，对：

- 缺少 `postExitReentry`；
- `enabled: false` 且含任意无效草稿字段；

断言原有 trades、equity、summary metrics、旧 latestSignal 字段完全相同，并且没有冷却、deferred 或 release 事件。

### 9.3 无前视

对每种 release state rule：

1. 用截至释放日 R 的数据运行；
2. 修改 R 之后的 OHLC 为极端值再运行；
3. 断言 R 的 snapshot、release 结果、scheduled order 完全相同。

另断言 `revalidate_entry` 的金叉只看 R 与 R-1，不能把历史暂存金叉当成 R 再次金叉。

### 9.4 US8–US16 映射

| BRD | 主要测试层 |
| --- | --- |
| US8 | 配置迁移 + Python/Worker disabled 全结果回归 + UI off 摘要 |
| US9 | Python/Worker state machine fixture |
| US10 | Python/Worker ignore + UI payload/event 展示 |
| US11 | Python/Worker retain/replace + UI 状态 |
| US12 | Python/Worker valid-through 边界 |
| US13 | event revalidation/current-state group + UI builder |
| US14 | order/trade 日期、尾部 pending、执行顺延 |
| US15 | config/favorites/experiments/duplicate round trip |
| US16 | 前端路径错误 + Flask/Worker server-side validation |

## 10. 迁移和实现风险

### 高风险

- Flask 与 Sites Worker 是两份引擎。共享 fixture 和 Worker 测试是上线门，不可只验证 Flask。
- 当前 `pending` 同时被当作“当前持仓”和“下一目标”。重构时必须显式区分实际持仓与待执行目标，同时保留旧字段，避免 UI 或调用方误解。
- CAPE 可产生独立的 risk/fallback 切换。本方案只让 exit-rule-originated 的实际退出成交启动冷却，避免把风险过滤恢复误当成新入场事件。
- 当前所有候选共同按所有 ticker 做一次 inner join；这会使一个候选的额外资产影响其他候选日期。此次状态机使用现有对齐序列以保证可比性，但属于后续需要独立处理的技术债。

### 中风险

- 事件流可能比 trades 大；最多 5 个日线策略仍可控。若未来加入网格搜索，再设计分页，P0 不截断解释事件。
- localStorage 中可能有损坏或未知版本对象；读取失败应隔离单条对象，不清空其他收藏。
- 事件型规则与状态型规则名称相近，UI 文案必须明确“当日再次发生”与“当前仍满足”。

## 11. 待确认项

以下不阻塞 P0，按本方案默认值实施：

- P0 release current-state rule catalog 采用 3.3 的八种规则；后续新增规则只扩展 catalog。
- CAPE filter 切换不启动 post-exit cooldown；只有完整 exit rule group 产生且实际成交的退出启动。
- 实验和策略继续只保存在 localStorage，不接 Notion。

如产品希望 CAPE 退出也启动冷却，需新增退出原因策略和 base-risk-on 恢复语义，属于 BRD 已列 P1，不应在本次隐式扩范围。

## 12. 验证命令

```bash
python3 -m unittest discover -s backend -p 'test_*.py'
npm test
npm run build
npm run lint
git diff --check
```

Python syntax/test 产生的 `__pycache__` 和 `.pyc` 按项目规则删除。
