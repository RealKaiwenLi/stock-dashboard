# 策略回测实验台多规则配置任务清单

## 任务

1. 更新 BRD，明确 `Hist > 0` 是普通退出规则，不再是附加 checkbox。
2. 更新默认实验结构为 `entry.logic/rules` 和 `exit.logic/rules`，并保留旧结构兼容。
3. 添加前端规则组编辑器：
   - 入场支持添加/删除多条规则。
   - 退出支持添加/删除多条规则。
   - 每组支持 `AND` / `OR`。
   - 最后一条规则不可删除。
4. 更新中英文文案，移除“退出附加条件”表达。
5. 更新 Flask 后端规则解析：
   - 支持新规则组 payload。
   - 兼容旧单规则 payload 和 `requirePositiveHist`。
   - `Hist > 0` 作为 `hist_positive` 规则求值。
6. 补充前端测试：
   - 默认退出规则列表包含 `Hist > 0` 规则。
   - 不再渲染旧的 Hist checkbox。
   - 入场和退出规则组提交 `rules[]` 和 `logic`。
7. 运行验证命令：
   - `npm test`
   - `npm run build`
   - `npm run lint`
   - `python3 -m py_compile backend/app.py`

## CAPE 风险过滤任务

8. 为策略配置增加 `riskFilter.cape.enabled/max`，默认关闭。
9. 在策略编辑器加入 CAPE 风险过滤开关和阈值输入，并更新中英文文案。
10. 让策略收藏保存和恢复 CAPE 配置。
11. 后端实现 CAPE 月度数据抓取、TTL 缓存、下月可用对齐和数据审计。
12. 将回测持仓逻辑扩展为“基础趋势状态 + CAPE 风险许可”，支持 CAPE 恢复后自动重新进入 Risk Asset。
13. 在当前信号和交易记录中展示 CAPE 条件与过滤切换原因。
14. 添加前端 payload 测试和后端状态机测试。
15. 运行完整验证命令。
