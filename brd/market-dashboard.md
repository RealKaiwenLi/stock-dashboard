# 美股大盘首页 Dashboard BRD

## 1. 背景与机会

背景：

- 用户希望构建一个个人使用的美股 dashboard，用于快速查看大盘状态，而不是做实时 T0 交易。
- 第一版聚焦首页，不做完整交易终端，也不做复杂蜡烛图。
- 由于 API 成本和数据限制，MVP 只追踪少量高价值市场 proxy。

用户痛点：

- 打开普通行情软件时信息过载，蜡烛图、新闻、个股列表太多，不适合快速判断大盘环境。
- 用户想在一个页面里看到三大指数、VIX 风险、市场状态和简单解释。
- 用户需要知道数据是否延迟，避免误以为是实时交易信号。

机会判断：

- 一个轻量、默认中文、可切换英文、指标解释清楚的首页 dashboard，可以帮助用户快速回答：“今天美股大盘强不强、风险高不高、科技股是不是领涨？”

## 2. 目标用户与场景

目标用户：

- 主要用户是项目 owner 本人。
- 使用者熟悉基本美股概念，默认希望 dashboard 用中文解释自定义指标，也希望必要时切换到英文界面阅读市场术语。

核心场景：

- 盘中快速扫一眼大盘环境。
- 收盘后或第二天盘前复盘最近一个交易日的大盘表现。
- 在查看个人关注股票前，先理解当前市场背景。

当前替代方案：

- 券商 App、TradingView、Yahoo Finance、Google Finance。
- 问题是这些工具通常图表多、指标散、中文解释不足，且需要用户自己综合判断。

## 3. 问题定义

要解决的问题：

- 用一个首页清晰展示美股三大指数 proxy 和 VIX 风险状态。
- 用自定义 gauge 快速总结市场状态、VIX 风险、恐惧与贪婪程度，但必须解释计算方式和用途。
- 明确数据延迟和最后更新时间。

不解决的问题：

- 不提供买卖建议。
- 不做交易下单。
- 不做实时 T0 交易辅助。
- 不做完整技术分析工具。
- 不做蜡烛图。
- 不做全市场 market breadth，因为 MVP 不拉取全部成分股数据。

关键假设：

- Massive Stocks Starter 的 15 分钟延迟数据对该 MVP 足够。
- 用户接受使用 ETF/index proxy 表示三大指数。
- 用户更重视状态摘要和解释，而不是高频 tick 数据。

## 4. 产品目标与成功指标

产品目标：

- 用户打开首页后，10 秒内能理解当前美股大盘状态。
- 首页能展示三大指数状态、VIX 风险、市场脉搏、恐惧与贪婪指数、市场风格和数据更新时间。
- 自定义指标必须可解释，避免黑盒结论。

用户成功指标：

- 用户能快速判断当前市场是偏强、中性还是偏弱。
- 用户能理解 VIX 当前处于平静、正常、警惕、紧张还是恐慌。
- 用户能理解当前市场情绪更偏恐惧、中性还是贪婪。
- 用户能看到 SPY、QQQ、DIA 的近期走势和当前状态。
- 用户能在顶部 bar 切换中文和英文，并看到页面核心文案、指标解释、状态标签随语言切换。

业务成功指标：

- MVP 页面可以作为后续 watchlist、个股详情、更多市场指标的首页基础。

反指标/护栏指标：

- 页面不应让用户误解为实时交易工具。
- 页面不应展示无法解释的黑盒预测。
- 页面不应依赖高 API 消耗的全市场扫描。

## 5. MVP 范围

P0 必须有：

- 顶部 bar，表明当前页面是首页，并为后续页面预留导航空间。
- 顶部 bar 提供中英文切换控件：
  - 默认语言为中文。
  - 用户可以在顶部 bar 切换 `中文` / `English`。
  - 切换后页面核心 UI 文案、状态标签、metric 解释和免责声明必须同步切换。
  - ticker、API 名称、技术标识和专有缩写可以保持英文。
- 三大指数卡片：
  - `SPY`：标普 500 proxy
  - `QQQ`：纳斯达克 100 proxy
  - `DIA`：道琼斯 proxy
- 每个指数卡片展示：
  - 当前语言的指数名称
  - ticker
  - 当前价格
  - 今日涨跌点数
  - 今日涨跌幅
  - 5 日表现
  - 1 月表现
  - 简单 line chart
- Line chart 行为：
  - 盘中显示当天 intraday line chart。
  - 收盘后、盘前、周末或假日显示最近一个完整交易日的 intraday line chart。
  - 不使用蜡烛图。
- VIX 风险 gauge：
  - 显示 VIX 当前值。
  - 显示风险等级。
  - 使用固定阈值和颜色。
- 市场脉搏 gauge：
  - 显示 0-100 分。
  - 显示状态：偏弱 / 中性 / 偏强。
  - 使用透明计算规则。
- 恐惧与贪婪 gauge：
  - 显示 0-100 分。
  - 显示状态：极度恐惧 / 恐惧 / 中性 / 贪婪 / 极度贪婪。
  - MVP 调用 FearGreedChart API：`https://feargreedchart.com/api/?action=all`。
  - 展示 API 返回的总分和组件分数，不在前端自行复刻完整算法。
- 市场风格标签：
  - 科技股领涨
  - 蓝筹股领涨
  - 走势均衡
  - 整体偏弱
- Last Updated / Data Delay：
  - 显示最后更新时间。
  - 显示数据延迟 15 分钟。
  - 显示市场状态：盘中 / 盘前 / 盘后 / 已收盘。
- 每个自定义 metric 必须有解释入口，例如 tooltip、popover 或小字“如何计算？” / “How is this calculated?”。
- 页面底部或指标解释中必须声明：本页为市场状态摘要，不构成交易建议。

P1 应该有：

- 每个指数显示距离日内高点/低点的位置。
- 每个指数显示距离 50 日均线。
- VIX 显示今日变化。
- 指标解释支持点击展开，而不是只 hover。
- 恐惧与贪婪 gauge 展示 API 返回的各组成项分数、权重和说明。

P2 可以后续做：

- Watchlist。
- 更多数据源，例如 IWM、HYG、TLT、UUP。
- Market breadth。
- Sector snapshot。
- 使用 API 返回的 sector、recent、backtest、notable 数据增强情绪模块。
- WebSocket live mode。
- 用户自定义 threshold。
- 记住用户上一次选择的语言。
- 根据浏览器语言自动选择初始语言。

明确不做：

- 交易下单。
- 实时 tick tape。
- bid/ask quote。
- 蜡烛图。
- 个股详情页。
- 账户/portfolio 盈亏。
- 新闻情绪分析。

## 6. 用户流程

入口：

- 用户打开应用首页。

核心路径：

1. 用户看到顶部 bar，确认当前在首页。
2. 用户可以保留默认中文，也可以在顶部 bar 切换到 English。
3. 用户看到市场脉搏 gauge，理解整体市场偏强、中性或偏弱。
4. 用户查看恐惧与贪婪 gauge，理解当前市场情绪偏恐惧、中性还是贪婪。
5. 用户查看 VIX 风险 gauge，理解当前风险等级。
6. 用户查看 SPY、QQQ、DIA 三张指数卡片和 line chart。
7. 用户查看市场风格标签，理解当前是科技股领涨、蓝筹股领涨、走势均衡还是整体偏弱。
8. 用户查看 Last Updated / Data Delay，确认数据时效。
9. 用户可以打开 metric 解释，理解计算方式。

异常/边界情况：

- 数据加载中：显示 loading state。
- API 失败：显示错误状态和重试入口。
- 某个 ticker 数据缺失：该卡片显示不可用，不影响其他卡片。
- 当前非交易时间：使用最近一个完整交易日的数据，并明确显示市场状态。
- VIX 数据缺失：VIX gauge 显示不可用，市场脉搏应降级计算或显示说明。
- FearGreedChart API 失败且无有效本地缓存：不显示恐惧与贪婪 gauge，不展示 fallback 估算。
- FearGreedChart API 失败但存在未过期本地缓存：使用缓存数据显示恐惧与贪婪 gauge，并标注缓存更新时间。
- 用户切换语言时：不重新拉取市场数据，不重置已加载数据，不改变分数或图表，只替换本地化文案。

结束状态：

- 用户获得一个清晰的大盘状态摘要，并理解数据延迟和指标含义。

## 7. 功能需求

| 功能名称 | 用户价值 | 需求描述 | 优先级 | 依赖 |
| --- | --- | --- | --- | --- |
| 顶部 bar | 明确当前页面、后续导航空间和语言选择 | 页面顶部展示应用名称、当前页面“首页”/“Home”、数据状态区域、后续导航入口和中英文切换控件 | P0 | 无 |
| 中英文切换 | 让用户按阅读习惯查看 dashboard | 顶部 bar 支持中文和 English 切换，切换后核心 UI、状态标签、解释文案和免责声明同步变更 | P0 | 本地化文案 |
| 三大指数卡片 | 快速查看主要市场 proxy | 展示 SPY、QQQ、DIA 的价格、涨跌、5 日/1 月表现和 line chart | P0 | 市场数据 |
| 指数 line chart | 不用蜡烛图也能看走势 | 显示当天或最近完整交易日的 intraday line chart | P0 | 历史/分钟数据 |
| VIX 风险 gauge | 快速理解市场波动风险 | 根据 VIX 当前值展示风险等级和颜色 | P0 | VIX 数据 |
| 市场脉搏 gauge | 快速总结市场状态 | 基于 SPY、QQQ、DIA、VIX 计算 0-100 分 | P0 | 三大指数和 VIX 数据 |
| 恐惧与贪婪 gauge | 快速理解市场情绪 | 调用 FearGreedChart API 展示 0-100 总分、状态、组件分数、权重和解释 | P0 | FearGreedChart API |
| 市场风格标签 | 判断当前市场偏好 | 基于 SPY、QQQ、DIA 的相对表现判断科技股领涨、蓝筹股领涨、走势均衡或整体偏弱 | P0 | 三大指数数据 |
| 数据时效提示 | 避免误解为实时交易数据 | 显示 Last updated、15 分钟延迟、市场状态 | P0 | 数据时间戳 |
| Metric 解释 | 提升信任和可理解性 | 每个自定义指标提供当前语言的解释，说明衡量什么、输入是什么、不是交易建议 | P0 | UI 交互 |

## 8. 用户故事与验收标准

### US1：首页用户可以查看三大指数状态

作为个人投资者，我希望在首页看到 SPY、QQQ、DIA 的状态，以便快速判断美股三大指数的表现。

验收标准：

- Given 首页加载成功
- When 用户查看三大指数区域
- Then 页面展示 SPY、QQQ、DIA 三张卡片
- And 每张卡片展示当前语言的指数名称、ticker、当前价格、今日涨跌点数、今日涨跌幅、5 日表现、1 月表现
- And 每张卡片展示 line chart
- And 不展示蜡烛图

### US2：首页用户可以查看 VIX 风险等级

作为个人投资者，我希望看到 VIX 风险 gauge，以便快速理解当前市场波动风险。

验收标准：

- Given VIX 数据加载成功
- When 用户查看 VIX 风险区域
- Then 页面展示 VIX 当前值、风险等级和颜色
- And 阈值符合：
  - VIX < 15：平静，绿色
  - 15 <= VIX < 20：正常，黄绿
  - 20 <= VIX < 30：警惕，黄色
  - 30 <= VIX < 40：紧张，橙色
  - VIX >= 40：恐慌，红色

### US3：首页用户可以查看市场脉搏

作为个人投资者，我希望看到一个市场脉搏 gauge，以便快速了解当前大盘整体环境。

验收标准：

- Given SPY、QQQ、DIA、VIX 数据加载成功
- When 用户查看市场脉搏
- Then 页面展示 0-100 分数
- And 页面展示状态：
  - 0-30：偏弱，红色
  - 31-60：中性，黄色
  - 61-100：偏强，绿色
- And 页面提供“如何计算？”解释入口
- And 解释中说明该指标不是买卖信号

建议计算规则：

- 市场脉搏分数 = SPY 趋势分 * 0.4 + QQQ 趋势分 * 0.25 + DIA 趋势分 * 0.2 + VIX 风险分 * 0.15
- 每个指数趋势分为 0-100：
  - 今日涨跌幅 > 0：+25
  - 5 日表现 > 0：+25
  - 当前价 > 20 日均线：+25
  - 当前价 > 50 日均线：+25
- VIX 风险分：
  - VIX < 15：100
  - 15 <= VIX < 20：80
  - 20 <= VIX < 30：50
  - 30 <= VIX < 40：20
  - VIX >= 40：0

### US4：首页用户可以查看市场风格

作为个人投资者，我希望看到当前市场风格，以便知道是科技股领涨、蓝筹股领涨、走势均衡还是整体偏弱。

验收标准：

- Given SPY、QQQ、DIA 数据加载成功
- When 用户查看市场风格
- Then 页面展示以下之一：
  - 科技股领涨
  - 蓝筹股领涨
  - 走势均衡
  - 整体偏弱
- And 页面提供解释入口

建议计算规则：

- 对 SPY、QQQ、DIA 计算 leadership score：
  - 0.5 * 今日涨跌幅 + 0.3 * 5 日表现 + 0.2 * 1 月表现
- 如果 QQQ 分数最高，且比 SPY 高 0.5 个百分点以上：科技股领涨
- 如果 DIA 分数最高，且比 SPY 高 0.5 个百分点以上：蓝筹股领涨
- 如果三者分数差距都小于等于 0.5 个百分点：走势均衡
- 如果三者今日涨跌幅和 5 日表现都为负：整体偏弱

### US5：首页用户可以理解数据时效

作为个人投资者，我希望看到数据更新时间和延迟提示，以便避免把 delayed data 当成实时交易数据。

验收标准：

- Given 页面加载成功
- When 用户查看顶部或页面状态区域
- Then 页面显示最后更新时间
- And 页面显示“数据延迟 15 分钟”
- And 页面显示市场状态：盘中 / 盘前 / 盘后 / 已收盘

### US6：首页用户可以理解自定义 metric

作为个人投资者，我希望每个自定义 metric 都有中文解释，以便知道它衡量什么、怎么计算、有什么限制。

验收标准：

- Given 页面展示市场脉搏、VIX 风险或市场风格
- When 用户点击或 hover 解释入口
- Then 页面展示中文解释
- And 解释包含：
  - 该 metric 衡量什么
  - 输入数据是什么
  - 计算或阈值概览
  - 该 metric 不构成交易建议

### US7：首页用户可以查看恐惧与贪婪指数

作为个人投资者，我希望看到一个恐惧与贪婪 gauge，以便快速理解当前市场情绪是偏恐惧、中性还是贪婪。

验收标准：

- Given SPY、QQQ、DIA、VIX 数据加载成功
- When 用户查看恐惧与贪婪区域
- Then 页面展示 0-100 分数
- And 页面展示状态：
  - 0-20：极度恐惧，红色
  - 21-40：恐惧，橙色
  - 41-60：中性，黄色
  - 61-80：贪婪，绿色
  - 81-100：极度贪婪，深绿色
- And 页面提供“如何计算？”解释入口
- And 解释中展示 API 返回的组件、权重和说明
- And 解释中说明该指标不是买卖信号
- And API 不可用且无有效缓存时，该模块不显示

MVP 数据源：

- API endpoint: `https://feargreedchart.com/api/?action=all`
- 调用策略：
  - 使用 local cache，缓存 TTL 为 15 分钟。
  - 如果存在未过期缓存，直接使用缓存，不调用 API。
  - 如果缓存不存在或已过期，再调用 API。
  - API 调用成功后更新缓存。
  - API 调用失败且无有效缓存时，不显示恐惧与贪婪模块。
  - API 调用失败但有未过期缓存时，继续显示缓存数据。
- 顶层字段：
  - `market`: 市场数据对象，包含 `^VIX`、`^VIX3M`、`SPY`、`QQQ`、`DIA`、`IWM`、`HYG`、`LQD`、`TLT` 和 sector ETF 等。
  - `score`: 当前恐惧与贪婪总分和组件。
  - `sectors`: sector ETF 对应分数。
  - `recent`: 历史每日恐惧与贪婪分数数组，元素为 `{ date, score }`。
  - `backtest`: 按情绪区间分组的历史回测统计。
  - `notable`: 重要历史事件与当时分数。
  - `ts`: API 时间戳。
- `score.score`: 当前 0-100 总分。
- `score.components`: 组件数组，每个组件包含：
  - `name`: 组件名称。
  - `val`: 组件分数，0-100。
  - `wt`: 权重。
  - `desc`: 组件说明。
  - `raw`: 原始输入摘要。

当前 API 组件：

| 组件 | 权重 | 说明 | 示例 raw |
| --- | --- | --- | --- |
| VOLATILITY | 25 | VIX vs 20-day average | VIX 16.1 / MA20 17 |
| MOMENTUM | 25 | S&P 500 vs 125-day MA | SPY 754 / MA125 694 |
| PUT/CALL | 20 | Options sentiment (5-day avg) | VIX/VIX3M 0.81 |
| SAFE HAVEN | 15 | Stocks vs bonds 20-day | SPY-TLT +3.7% |
| JUNK BONDS | 15 | High yield vs investment grade | HYG-LQD -0.1% |

说明：

- MVP 直接展示 API 返回的总分和组件，不声称复刻 CNN 或 StockMarketWatch 的私有计算公式。
- API 的 `PUT/CALL` 组件示例 raw 使用 `VIX/VIX3M`，UI 文案应按 API 返回的 `desc` 和 `raw` 展示，不额外解释成传统 put/call ratio，避免误导。
- 如果 API 不可用且没有有效缓存，页面隐藏该 gauge，不显示备用估算。

### US8：首页用户可以切换中文和英文

作为个人投资者，我希望在页面顶部切换中文和英文，以便根据使用场景选择更舒服的阅读语言。

验收标准：

- Given 首页加载成功
- When 用户查看顶部 bar
- Then 页面展示语言切换控件
- And 默认语言为中文
- And 当前选中的语言有明确视觉状态
- When 用户从中文切换到 English
- Then 顶部导航、模块标题、状态标签、数据时效提示、解释入口、metric 解释和免责声明切换为英文
- And SPY、QQQ、DIA、VIX、ticker、API 名称、数值、百分比和 chart 数据保持不变
- And 不重新请求市场数据
- When 用户从 English 切换回中文
- Then 顶部导航、模块标题、状态标签、数据时效提示、解释入口、metric 解释和免责声明切换回中文

必须支持的本地化范围：

- 顶部 bar：
  - 应用名称可以保持英文或使用双语品牌名。
  - 当前页面：`首页` / `Home`。
  - 语言选项：`中文` / `English`。
- 市场状态：
  - `盘中` / `Market Open`
  - `盘前` / `Pre-market`
  - `盘后` / `After-hours`
  - `已收盘` / `Closed`
- 数据时效：
  - `最后更新` / `Last updated`
  - `数据延迟 15 分钟` / `Data delayed 15 minutes`
- 指标与模块标题：
  - `市场脉搏` / `Market Pulse`
  - `VIX 风险` / `VIX Risk`
  - `恐惧与贪婪` / `Fear & Greed`
  - `市场风格` / `Market Style`
  - `如何计算？` / `How is this calculated?`
- 状态标签：
  - `偏弱` / `Weak`
  - `中性` / `Neutral`
  - `偏强` / `Strong`
  - `平静` / `Calm`
  - `正常` / `Normal`
  - `警惕` / `Elevated`
  - `紧张` / `Stressed`
  - `恐慌` / `Panic`
  - `极度恐惧` / `Extreme Fear`
  - `恐惧` / `Fear`
  - `贪婪` / `Greed`
  - `极度贪婪` / `Extreme Greed`
  - `科技股领涨` / `Tech-led`
  - `蓝筹股领涨` / `Blue-chip-led`
  - `走势均衡` / `Balanced`
  - `整体偏弱` / `Broadly Weak`
- 指标解释与免责声明：
  - 中文模式展示中文解释。
  - 英文模式展示英文解释。
  - 英文免责声明应表达：This page summarizes market conditions and is not financial advice.

非目标：

- MVP 不要求保存语言偏好到 localStorage。
- MVP 不要求根据浏览器语言自动选择初始语言。
- MVP 不要求翻译 ticker、ETF 名称、API 字段名、技术缩写或数据源名称。
- MVP 不要求接入第三方 i18n 库，除非 Technical Planner 判断现有文案规模已明显需要。

## 9. 非功能需求

性能：

- MVP 使用 Massive WebSocket 获取 `SPY`、`QQQ`、`DIA` 的盘中分钟级 aggregate 更新。
- VIX 优先使用 Massive Indices WebSocket；如果当前会员不包含 indices feed，则使用 FearGreedChart API 返回的 `market.^VIX` 作为 VIX 数据源。
- 恐惧与贪婪模块额外调用 FearGreedChart API，并使用 15 分钟 local cache。
- 页面初始加载应尽量在 2 秒内展示 skeleton/loading state。
- 刷新频率不需要高频；建议 1-5 分钟刷新一次。

可用性：

- 页面默认中文，但必须支持顶部切换到英文。
- ticker、市场简称、命令和技术标识可保留英文。
- Gauge 颜色应清楚表达风险等级。
- Metric 解释不能遮挡核心内容。

安全与隐私：

- 不应在前端暴露 Massive API key。
- Massive WebSocket 需要鉴权；生产或共享部署不应在前端暴露 API key。
- MVP 如果只在本机个人使用，可以临时使用前端环境变量接入；正式方案应通过后端 WebSocket proxy 或 server-side 方案处理。

可访问性：

- Gauge 不能只依赖颜色表达状态，必须有文字标签。
- Line chart 应有 aria label 或文本摘要。
- 解释入口应支持键盘访问。

国际化/本地化：

- MVP 支持中文和英文 UI，默认中文。
- 中英文切换应在当前页面内完成，不刷新页面，不重置行情数据。
- MVP 不要求持久化语言偏好；刷新页面后可以回到默认中文。
- 文案源应集中管理，避免组件内散落难以维护的硬编码双语字符串。
- 时间显示应明确 ET 或本地时间，避免混淆。

数据与埋点：

- MVP 可以暂不做埋点。
- 后续可记录用户最常查看的模块或刷新行为。

## 10. 风险、依赖与待确认

风险：

- Massive 对 VIX symbol 的具体 ticker 格式需要确认，例如 `VIX` 或 `^VIX`。
- VIX 可能属于 Massive Indices WebSocket，而不是 Stocks WebSocket；如果只购买 Stocks 会员，VIX 可能需要备用数据源。
- 15 分钟 delayed data 可能不适合用户未来的实时交易场景。
- 如果 API 返回的数据字段不足，部分 metric 可能需要后端计算或额外历史数据。
- 市场脉搏和市场风格是自定义 derived metric，必须避免被误解为预测或买卖信号。
- 恐惧与贪婪指数依赖第三方 API，字段、算法或可用性可能变化。
- 前端 local cache 可能存在过期、损坏或 schema 不兼容问题，需要安全降级。
- 双语文案如果散落在多个组件中，后续新增模块可能出现翻译遗漏或中英文状态不一致。

依赖：

- Massive Stocks WebSocket，用于 `SPY`、`QQQ`、`DIA` 的 per-minute aggregates。
- Massive Indices WebSocket 或 FearGreedChart API，用于 VIX 当前值。
- 启动页面时需要初始历史数据；MVP 可用 mock history，后续可用 Massive REST 补齐开盘前/首次加载数据。
- 前端 chart/gauge 实现方案。
- FearGreedChart API：`https://feargreedchart.com/api/?action=all`。
- 本地化文案字典或等价机制，用于中英文切换。

待确认问题：

- Massive 中 VIX 的可用 symbol、endpoint，以及当前会员是否包含 Indices feed。
- WebSocket 鉴权方案：本机前端环境变量，还是本地/后端 proxy。
- 首次加载 line chart 的历史数据来源：mock history、Massive REST，还是等待 WebSocket 累积。
- Line chart 的默认时间粒度：分钟级、5 分钟级或聚合后的 intraday。
- 数据更新时间显示 ET、本地时间，还是两者都显示。
- FearGreedChart API 是否允许前端直接调用，是否存在 CORS、频率限制、稳定性或授权限制。
- local cache 使用 `localStorage` 还是 IndexedDB。
- 中英文切换的控件样式采用 segmented control、按钮组还是菜单。
- 是否需要在 P1 记住用户上一次选择的语言。

建议验证方式：

- 先用 mock data 实现 UI、公式和状态逻辑，再接入 Massive WebSocket service。
- Planner 阶段确认 Massive WebSocket endpoint、subscription channel 和 message shape。
- TDD 阶段优先测试 metric 计算函数和阈值映射。
- 恐惧与贪婪指数先测试 API response adapter、等级映射、15 分钟缓存策略和不可用隐藏状态。
- 中英文切换需要组件测试覆盖默认中文、切换英文、切回中文，以及切换时核心数值不变化。

## 11. 交付拆解

设计需要产出：

- 首页布局。
- 顶部 bar 样式。
- 指数卡片样式。
- Market Pulse gauge。
- VIX gauge。
- Fear & Greed gauge。
- Market style label。
- Metric 解释 popover/tooltip。
- 顶部中英文切换控件。
- Loading/error/empty states。

工程需要实现：

- 首页结构。
- 数据模型。
- mock market data。
- metric 计算函数。
- gauge 组件。
- line chart 组件。
- 三大指数卡片。
- 数据时效提示。
- metric 解释交互。
- 中英文文案字典或等价的本地化机制。
- 顶部语言切换状态。

测试需要覆盖：

- VIX 阈值到风险等级和颜色的映射。
- 市场脉搏分数计算。
- 市场脉搏分数到状态的映射。
- FearGreedChart API adapter。
- FearGreedChart local cache。
- 恐惧与贪婪分数到状态的映射。
- 市场风格计算。
- 首页能渲染 SPY、QQQ、DIA、VIX 核心内容。
- metric 解释入口可用。
- 默认中文可见，切换 English 后核心文案变为英文，切回中文后恢复中文。
- 切换语言不改变行情数值、百分比、分数或 chart 数据。

上线前检查：

- `npm test`
- `npm run build`
- `npm run lint`
- 页面明确显示数据延迟。
- 页面明确声明不构成交易建议。

## 12. 后续迭代

下一步可验证实验：

- 用户每天打开首页时，是否能在 10 秒内理解市场状态。
- 用户是否觉得 gauge 和中文解释足够清楚。
- 用户是否会实际使用英文模式，以及英文文案是否比中文更适合部分市场术语。
- 用户是否还需要 watchlist 放在首页。

后续版本方向：

- Watchlist。
- 真实 Massive API 接入。
- WebSocket live mode。
- 更多 proxy：IWM、HYG、TLT、UUP。
- Sector snapshot。
- Market breadth。
- 用户自定义 dashboard 模块。
- 持久化语言偏好。
- 根据浏览器语言或用户设置选择默认语言。

暂缓但值得保留的想法：

- 真实 market breadth。
- 个股详情页。
- 交易提醒。
- Portfolio tracking。
