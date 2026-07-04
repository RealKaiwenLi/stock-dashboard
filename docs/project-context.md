# Project Context

## 项目定位

这是一个 AI-native development package，同时也是一个 Vite React stock dashboard app 的起点。项目的核心目标不仅是实现 dashboard 功能，也是在本仓库内沉淀一套可复用的 agentic development workflow。

当前默认工作流是：

1. PM agent 定义产品需求并写入 BRD。
2. Technical Planner agent 将 BRD 转换为技术方案和任务清单。
3. TDD agent 按任务清单逐步写测试、实现代码并验证。

## 当前阶段

项目处于早期初始化阶段。

- React app 仍接近 Vite 默认模板。
- 测试框架已经配置为 Vitest + React Testing Library。
- 真实 stock dashboard 功能尚未开始实现。
- Feature 级需求、技术方案和任务拆解应先进入 `brd/`。

## 技术栈

- Vite
- React
- Vitest
- React Testing Library
- jsdom
- ESLint
- npm

## 重要目录和文件

- `AGENTS.md`: 项目级 agent 行为规则和 workflow 路由。
- `docs/project-context.md`: 稳定项目上下文。agent 在规划或实现前应先阅读。
- `brd/`: feature 级文档目录。PM、Planner、TDD 的交接文档都放在这里。
- `src/`: React app 源码。
- `src/App.test.jsx`: 当前示例组件测试。
- `src/setupTests.js`: Vitest 测试环境 setup。
- `vite.config.js`: Vite 和 Vitest 配置。
- `package.json`: npm scripts 和依赖。

## Feature 文档约定

每个中等以上 feature 推荐使用一组三个文档：

- `brd/<feature>.md`: PM agent 写，定义产品需求、用户故事、验收标准、范围和非目标。
- `brd/<feature>.tech.md`: Technical Planner agent 写，定义技术路线、依赖选择、文件计划、测试策略、风险和待确认项。
- `brd/<feature>.tasks.md`: Technical Planner agent 写，定义可交给 TDD agent 顺序执行的任务。

小改动可以不创建完整三件套，但只要涉及新用户行为、多个文件、数据模型、状态管理、依赖选择或测试策略，就应优先走完整 workflow。

## 命令

- `npm run dev`: 启动 Vite dev server，长运行命令，除非用户明确要求否则先问。
- `npm test`: 运行 Vitest 一次。
- `npm run test:watch`: 启动 Vitest watch mode，长运行命令，除非用户明确要求否则先问。
- `npm run build`: 生产构建。
- `npm run lint`: ESLint 检查。

## 开发约定

- 默认中文沟通和中文文档。
- 代码、命令、文件路径、package 名称保持项目原有英文风格。
- 优先使用现有依赖和项目模式，避免过早引入新 library。
- 新依赖需要用户确认，尤其是会修改 `package.json` 或 `package-lock.json` 的操作。
- TDD agent 应优先按 `brd/<feature>.tasks.md` 执行，而不是从模糊需求直接写代码。
- 每个行为变更应尽量有测试覆盖。
- 完成实现后，相关 agent 应运行适用的验证命令：`npm test`、`npm run build`、`npm run lint`。

## 当前测试约定

- Test runner: Vitest。
- React component testing: React Testing Library。
- DOM environment: jsdom。
- 测试 setup: `src/setupTests.js`。
- 示例测试: `src/App.test.jsx`。

## 文档维护规则

- `AGENTS.md` 保持简短，作为 agent 路由和行为规则。
- 稳定项目上下文放在本文件。
- Feature 级上下文放在 `brd/`。
- 不要把临时讨论、过时假设或大型设计细节塞进 `AGENTS.md`。
- 当项目技术栈、命令、目录结构或 agent workflow 发生变化时，更新本文件。
