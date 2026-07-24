# 每日持仓起算日任务

## T001 配置与测试

- 为起算日重置、旧配置兼容和越界日期添加失败测试。
- 为信号表的起算日展示添加测试。

## T002 状态机实现

- 解析并校验可选 `position_start_date`。
- 保留完整历史指标计算。
- 从首个有效起算交易日以 `signal_symbol` 重置状态。
- 输出起算日审计字段。

## T003 生产配置

- 新增生产模型版本并配置 `2026-07-01`。
- 将其设为 active model。

## T004 验证

- 运行 `python3 -m unittest scripts.test_nasdaq_guide_signal`。
- 运行 `npm test`、`npm run build` 和 `npm run lint`。
