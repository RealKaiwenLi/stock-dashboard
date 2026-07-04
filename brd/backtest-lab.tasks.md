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
