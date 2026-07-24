# 每日持仓起算日技术方案

## 配置

在具体 `model_versions.<version>` 下增加可选 ISO 日期：

```json
{
  "position_start_date": "2026-07-01"
}
```

缺失该字段时保持原有全历史模拟行为。

## 计算

`compute_hold_signal` 继续先基于完整 `df` 计算 MACD、Signal、Hist 和退出 EMA，再确定状态机的起始索引：

- 未配置：沿用现有索引 1。
- 已配置：选择 `date >= position_start_date` 的第一行。
- 起始持仓为 `signal_symbol`，起始 pending 为空。
- 从起始行收盘开始判断入场或退出信号。

结果增加：

- `position_start_date`
- `position_start_bar_date`

## 文件

- `scripts/nasdaq_guide_config.json`
- `scripts/nasdaq_guide_signal.py`
- `scripts/test_nasdaq_guide_signal.py`

GitHub Action 无需硬编码日期；它继续读取同一个版本化配置。

## 测试

- 起算日前已经形成风险持仓，但起算日后没有新金叉时，应重置并保持 `signal_symbol`。
- 未配置起算日时保持连续历史持仓。
- 报告表格包含起算日期。
- 起算日晚于最新行情时抛出明确错误。

## 风险

- 这是有意改变生产持仓口径的模型版本变更，必须在报告中可追溯。
- 起算日只重置仓位状态，不得截断指标输入数据。
