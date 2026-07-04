# 市场与个股资讯模块 BRD

## 1. 背景与机会

当前 dashboard 已覆盖大盘状态、VIX、恐惧与贪婪等指标，但仍缺少“为什么波动”的解释层。用户希望免费获取可能造成美股大盘波动的资讯，并能看到个股相关事件，辅助理解市场背景，而不是提供交易建议。

机会：

- 把资讯分成“大盘波动线索”和“个股事件线索”，降低信息噪音。
- 优先使用免费或免费层数据源，适合个人 dashboard MVP。
- 使用官方来源补足新闻 API 的盲点，尤其是宏观数据、SEC 披露、央行/政府发布。

## 2. 目标用户与场景

目标用户：

- 项目 owner 本人。
- 关注美股大盘环境，也会查看少量自选个股。
- 希望中文快速理解“发生了什么”，不想打开多个新闻网站逐条读。

核心场景：

- 盘中看到 SPY/QQQ/VIX 异动后，想知道可能相关的新闻或宏观事件。
- 盘前或盘后查看今天有哪些经济数据、Fed 事件、财报或 SEC 披露。
- 查看某只自选股时，快速看到公司新闻、财报、8-K、重大披露或管理层/监管消息。

## 3. 问题定义

要解决的问题：

- 免费或低成本获取大盘级和个股级资讯。
- 把资讯按影响类型归类：宏观、货币政策、财政政策、财报、SEC 披露、行业、公司新闻、风险事件。
- 给每条资讯展示来源、发布时间、关联 ticker/topic、摘要和外链。
- 明确标注数据源限制、延迟和“非交易建议”。

不解决的问题：

- 不做新闻全文抓取和版权内容重发布。
- 不生成买卖建议。
- 不做付费新闻源集成，例如 Bloomberg、Reuters、Dow Jones。
- 不保证新闻与行情波动存在因果关系，只显示“可能相关”。
- 不做高频交易级新闻延迟优化。

## 4. 免费数据源调研结论

### P0 推荐组合

1. Alpha Vantage `NEWS_SENTIMENT`
   - 用途：个股新闻、金融市场、宏观、货币政策、财报、并购等主题聚合。
   - 优点：官方文档明确支持 ticker、topic、时间范围、排序；也支持 sentiment 和相关 ticker。
   - 风险：免费额度有限，前端暴露 API key 不适合公开部署。
   - 产品定位：MVP 主新闻 API。

2. SEC EDGAR RSS / search feeds
   - 用途：个股重大披露，例如 8-K、10-Q、10-K、S-1、Form 4。
   - 优点：官方、免费、适合公司事件。
   - 风险：不是新闻摘要，需要把 filing type 转成用户能理解的中文事件。
   - 产品定位：个股“官方披露”模块。

3. BLS Public Data API + release calendar
   - 用途：CPI、PPI、就业、非农等可能造成大盘波动的宏观数据。
   - 优点：官方免费，不需要注册即可使用部分公共 API。
   - 风险：需要维护 series id 和发布时间解释。
   - 产品定位：宏观事件/已发布数据模块。

4. FRED / Nasdaq Data Link 免费数据
   - 用途：利率、通胀、GDP、收益率、宏观时间序列。
   - 优点：适合做宏观背景，不一定是突发新闻。
   - 风险：不是新闻流，更多是数据解释。
   - 产品定位：大盘背景指标增强。

### P1 可选来源

1. Finnhub free tier
   - 用途：market news、company news。
   - 优点：免费层官方显示 60 calls/minute，company news 支持免费层。
   - 风险：free license 偏 personal use；端点覆盖和商业使用需确认。
   - 产品定位：Alpha Vantage 不够时的第二新闻源。

2. Marketaux free plan
   - 用途：金融新闻 API、实体识别、sentiment。
   - 优点：官网声明 free plan 无需支付信息，覆盖 stocks、indices、ETF、commodities、crypto。
   - 风险：免费请求量与 license 细节需实现前确认。
   - 产品定位：备用或对比源。

3. NewsAPI.org
   - 用途：一般新闻搜索。
   - 优点：开发测试免费。
   - 风险：免费 Developer plan 只能用于开发/测试，不能用于 staging/production；文章有延迟，不适合作为正式产品数据源。
   - 产品定位：仅限本地原型验证，不推荐作为正式 MVP 主源。

## 5. 产品形态建议

P0 页面模块：

- “今日可能影响大盘的线索”
  - 展示宏观/Fed/财政/市场结构相关资讯。
  - 默认 topic 包含 `financial_markets`、`economy_monetary`、`economy_macro`、`economy_fiscal`。
  - 每条显示：标题、来源、发布时间、topic、相关 ticker、简短摘要、外链。

- “个股官方披露”
  - 针对 watchlist ticker 拉 SEC RSS / EDGAR 最新 filing。
  - 按 filing type 标注：8-K 重大事项、10-Q 季报、10-K 年报、Form 4 内部人交易等。
  - 每条显示：公司/ticker、表格类型、提交时间、中文说明、SEC 链接。

- “个股新闻”
  - 针对 watchlist ticker 拉 Alpha Vantage 或 Finnhub company news。
  - 每条显示：ticker、标题、来源、发布时间、摘要、sentiment 或情绪标签。

- “数据源状态”
  - 显示各源最后更新时间、是否使用缓存、是否达到免费额度。
  - 明确标注“资讯仅用于背景理解，不构成交易建议”。

## 6. 用户故事与验收标准

### US1：用户可以看到大盘波动线索

作为用户，我希望看到与大盘波动相关的宏观和市场新闻，以便理解 SPY/QQQ/VIX 异动可能对应的背景。

验收标准：

- Given 首页资讯模块加载成功
- When 用户查看“大盘线索”
- Then 页面展示至少一组金融市场、宏观、货币政策或财政政策相关资讯
- And 每条资讯包含标题、来源、发布时间、摘要、外链
- And 页面说明这些资讯只是可能相关线索，不表示因果确认或交易建议

### US2：用户可以看到个股相关新闻

作为用户，我希望输入或使用 watchlist ticker 后看到相关个股新闻，以便快速了解公司层面的事件。

验收标准：

- Given 用户关注至少一个 ticker
- When 个股资讯加载成功
- Then 页面按 ticker 展示相关新闻
- And 每条新闻包含标题、来源、发布时间、摘要、外链
- And 如果数据源返回 sentiment，页面可以展示情绪标签，但必须解释来源

### US3：用户可以看到个股官方披露

作为用户，我希望看到 SEC 披露，以便区分媒体新闻和公司官方事件。

验收标准：

- Given 用户关注的 ticker 能映射到 CIK
- When SEC RSS / EDGAR 数据加载成功
- Then 页面展示最新 filings
- And filing type 转成中文解释
- And 每条披露链接到 SEC 官方页面

### US4：用户可以理解数据源限制

作为用户，我希望知道资讯来源和限制，以免误以为资讯完整、实时或免费额度无限。

验收标准：

- Given 资讯模块展示
- Then 页面展示数据来源列表和 last updated
- And API 失败或额度耗尽时显示降级状态
- And 不展示虚假的空摘要或编造新闻

## 7. MVP 范围

P0：

- 使用 Alpha Vantage `NEWS_SENTIMENT` 获取大盘 topic 资讯和 ticker 资讯。
- 使用 SEC RSS / EDGAR search feeds 获取 watchlist 公司的 filings。
- 使用本地缓存降低免费 API 消耗。
- UI 展示来源、时间、摘要、外链、topic/ticker、数据源状态。
- 不存储全文，不复刻付费内容。

P1：

- 接入 Finnhub 或 Marketaux 作为备用源。
- 加入 BLS / FRED 宏观事件卡片，例如 CPI、非农、失业率、Fed funds、10Y yield。
- 支持按影响类型筛选：宏观、Fed、财报、SEC、行业、公司。
- 增加“和今日行情异动的时间距离”提示。

P2：

- 后端 proxy，隐藏 API key 并统一缓存。
- 新闻去重、同一事件聚合。
- 简单 LLM 中文摘要，但必须保留原始来源链接。
- 用户自定义 watchlist 和关注 topic。

明确不做：

- 新闻因果判定。
- 自动交易建议。
- 付费新闻源。
- 版权全文抓取和重发布。

## 8. 风险与待确认

风险：

- 免费 API 额度低，前端直接请求容易耗尽或暴露 key。
- 新闻源 CORS、license 和生产使用限制需要逐个验证。
- 新闻 headline 和行情异动相关性不等于因果关系。
- SEC filings 信息密度高，需要良好中文解释，否则用户难以快速理解。

NEEDS CLARIFICATION：

- watchlist 第一版是否已经有固定 ticker 列表，还是先用 SPY/QQQ/DIA/AAPL/NVDA/TSLA 作为 demo？
- Alpha Vantage API key 是否已经可用？是否允许仅本机前端环境变量使用？
- 资讯模块是放在首页下方，还是后续独立页面？
- 是否接受 P0 只有标题/摘要/链接，不做 LLM 总结？

## 9. 参考来源

- Alpha Vantage API 文档：`https://www.alphavantage.co/documentation/`
- Finnhub pricing：`https://finnhub.io/pricing`
- Finnhub market news docs：`https://www.finnhub.io/docs/api/market-news`
- SEC RSS feeds：`https://www.sec.gov/about/rss-feeds`
- BLS Public Data API：`https://www.bls.gov/bls/api_features.htm`
- Nasdaq Data Link getting started：`https://docs.data.nasdaq.com/docs/getting-started`
- Marketaux：`https://www.marketaux.com/`
- NewsAPI pricing：`https://newsapi.org/pricing`
