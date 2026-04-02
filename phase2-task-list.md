# BaliClaw Phase 2 任务清单

## 1. 文档目的

本文档将 `phase2-design-spec.md` 拆分为可执行、可验证的开发任务。

Phase 2 涵盖六个能力域：MCP、SDK 原生 Skills、SubAgents、SOUL.md、USER.md、MEMORY.md。任务按依赖关系排序，优先完成基础设施变更，再逐个接入能力。

---

## 2. 总体交付目标

Phase 2 完成后，系统应满足：

1. Phase 1 所有行为不变（零回归）
2. 配置 MCP server 后 agent 可调用外部工具
3. SDK 原生 Skills 可被 agent 按需调用
4. 配置 SubAgent 后主 agent 可 spawn 子 agent
5. SOUL.md 定义的人格在 agent 回复中体现
6. USER.md 由 agent 在交互中逐步填充
7. MEMORY.md 跨会话持久化并自动注入 prompt

---

## 3. 里程碑

### M1. 配置与基础设施扩展

目标：扩展 config schema 和 tool policy，为所有 Phase 2 能力提供配置基础。

完成标准：
- 新增配置段可被正确解析和校验
- 空配置时行为与 Phase 1 完全一致
- allowedTools 合并逻辑正确

### M2. MCP 集成

目标：agent 可通过 MCP 连接外部工具。

完成标准：
- stdio 和 HTTP/SSE 类型 MCP server 均可配置
- agent 可调用 MCP tool 并返回结果
- MCP server 连接失败时有清晰日志

### M3. SDK 原生 Skills

目标：agent 可使用 SDK 原生 Skill 机制。

完成标准：
- `.claude/skills/` 下的 SKILL.md 可被 SDK 发现
- agent 可通过 Skill tool 调用
- Phase 1 prompt-only skills 继续正常工作

### M4. SubAgents

目标：主 agent 可 spawn 子 agent。

完成标准：
- 配置文件定义的 subagent 可被调用
- `promptFile` 可从文件加载 prompt
- subagent 引用的 MCP server 可正确解析

### M5. 个性化文件体系

目标：SOUL.md、USER.md、MEMORY.md 生效。

完成标准：
- prompt 组装顺序正确
- agent 可读写 USER.md 和 MEMORY.md
- MEMORY.md 按项目隔离
- 跨会话记忆可持久化

### M6. 测试与加固

目标：关键路径有测试覆盖，文档更新。

完成标准：
- 所有新增配置有 schema 测试
- prompt 组装有单元测试
- allowedTools 合并有单元测试
- CLAUDE.md 更新

---

## 4. 任务列表

### T01. 扩展 config schema — MCP

目标：在 `config/schema.ts` 中新增 `mcp` 配置段。

输入：
- `phase2-design-spec.md` 第 4.3、12 章

产出：
- `mcp` 配置段的 Zod schema（stdio + HTTP/SSE 两种类型）
- `AppConfig` 类型更新

验收标准：
- `mcp.servers` 为空对象时通过校验
- stdio server 必须有 `command` 字段
- HTTP/SSE server 必须有 `url` 字段
- 不配置 `mcp` 时，默认值为 `{ servers: {} }`
- 现有测试不回归

依赖：无

---

### T02. 扩展 config schema — agents

目标：在 `config/schema.ts` 中新增 `agents` 配置段。

输入：
- `phase2-design-spec.md` 第 6.5、12 章

产出：
- `agents` 配置段的 Zod schema（AgentDefinitionConfig）
- `AppConfig` 类型更新

验收标准：
- `agents` 为空对象时通过校验
- 每个 agent 必须有 `description`
- 每个 agent 必须有 `prompt` 或 `promptFile` 至少一个
- `model` 字段限定为 `"sonnet" | "opus" | "haiku" | "inherit"`
- 现有测试不回归

依赖：无

---

### T03. 扩展 config schema — memory

目标：在 `config/schema.ts` 中新增 `memory` 配置段。

输入：
- `phase2-design-spec.md` 第 10.5、12 章

产出：
- `memory` 配置段的 Zod schema
- `AppConfig` 类型更新

验收标准：
- 不配置 `memory` 时，默认值为 `{ enabled: true, globalEnabled: false, maxLines: 200 }`
- `maxLines` 必须为正整数
- 现有测试不回归

依赖：无

---

### T04. 扩展 config schema — skills.sdkNative + runtime.soulFile + runtime.userFile

目标：在现有 config schema 中新增 Phase 2 字段。

输入：
- `phase2-design-spec.md` 第 5.4、8.5、9.5、12 章

产出：
- `skills` schema 新增 `sdkNative` 字段（默认 true）
- `runtime` schema 新增 `soulFile` 字段（可选）
- `runtime` schema 新增 `userFile` 字段（可选）

验收标准：
- 不配置新增字段时，行为不变
- `skills.sdkNative` 默认为 true
- `runtime.soulFile` 和 `runtime.userFile` 为可选字符串
- 现有测试不回归

依赖：无

---

### T05. 重构 tool policy — allowedTools 合并

目标：将 `tool-policy.ts` 从固定列表升级为支持 MCP、Skills、SubAgents 的合并逻辑。

输入：
- `phase2-design-spec.md` 第 4.4、5.5、6.7、13 章

产出：
- `runtime/tool-policy.ts` 更新

验收标准：
- 基础工具列表来自 `tools.availableTools`（与 Phase 1 一致）
- 每个配置的 MCP server 追加 `mcp__<name>__*` 通配符
- `skills.sdkNative` 为 true 时追加 `"Skill"`
- `agents` 配置非空时追加 `"Agent"`
- 用户手动在 `tools.availableTools` 中包含 `"Agent"` 时不重复
- 空配置时输出与 Phase 1 完全一致

依赖：
- T01（MCP schema）
- T02（agents schema）
- T04（skills.sdkNative）

---

### T06. 实现 MCP 配置透传

目标：将 MCP server 配置传入 SDK `query()` 调用。

输入：
- `phase2-design-spec.md` 第 4.5 章

产出：
- `runtime/sdk.ts` 更新 — `createSdkQueryOptions()` 支持 `mcpServers`
- `runtime/agent-service.ts` 更新 — `AgentRunOptions` 新增 `mcpServers`
- `daemon/bootstrap.ts` 更新 — `buildAgentRunOptions()` 透传 MCP 配置

验收标准：
- 配置了 MCP servers 时，`query()` options 包含 `mcpServers`
- 未配置时，`query()` options 不包含 `mcpServers`
- MCP server 的 `env` 值不出现在日志中

依赖：
- T01（MCP schema）
- T05（tool policy）

---

### T07. 实现 SDK 原生 Skills 开关

目标：启用 SDK 的 `settingSources` 和 `"Skill"` tool。

输入：
- `phase2-design-spec.md` 第 5.5 章

产出：
- `runtime/sdk.ts` 更新 — 支持 `settingSources`
- `runtime/agent-service.ts` 更新 — `AgentRunOptions` 新增 `sdkNativeSkills`

验收标准：
- `skills.sdkNative` 为 true 时，`query()` options 包含 `settingSources: ["user", "project"]`
- `skills.sdkNative` 为 false 时，不传 `settingSources`
- Phase 1 prompt-only skills 在两种模式下都继续正常工作

依赖：
- T04（skills.sdkNative schema）
- T05（tool policy）

---

### T08. 实现 SubAgents 配置构建

目标：从 BaliClaw 配置构建 SDK 的 `agents` 参数。

输入：
- `phase2-design-spec.md` 第 6.5、6.6 章

产出：
- `runtime/agents.ts`（新文件） — SubAgent 配置构建逻辑
- `runtime/sdk.ts` 更新 — 传入 `agents`
- `runtime/agent-service.ts` 更新 — `AgentRunOptions` 新增 `agents`
- `daemon/bootstrap.ts` 更新 — `buildAgentRunOptions()` 透传

验收标准：
- `agents` 配置中使用 `prompt` 的定义正确传给 SDK
- `agents` 配置中使用 `promptFile` 的定义，文件内容被读取并填入 `prompt`
- `promptFile` 支持相对路径（相对于 `runtime.workingDirectory`）和绝对路径
- `promptFile` 文件不存在时报结构化错误
- `mcpServers` 字符串引用被解析为全局 MCP 配置中的 server 定义
- `agents` 为空时，不传 `agents` 参数给 SDK

依赖：
- T02（agents schema）
- T01（MCP schema，用于解析 mcpServers 引用）
- T05（tool policy）

---

### T09. 实现 SOUL.md 加载与注入

目标：读取 SOUL.md 并注入 system prompt。

输入：
- `phase2-design-spec.md` 第 8 章

产出：
- `runtime/prompts.ts` 更新 — `buildSystemPrompt()` 新增 SOUL.md section
- `BuildSystemPromptOptions` 新增 `soulFile` 字段

验收标准：
- 当 `runtime.soulFile` 配置指定路径时，从该路径读取
- 否则从 `<workingDirectory>/SOUL.md` 读取
- 文件不存在时静默跳过
- SOUL.md 内容在 prompt 中位于 AGENTS.md 之前
- 分隔符为 `=== SOUL.md ===`

依赖：无（`prompts.ts` 已存在）

---

### T10. 实现 USER.md 加载与注入

目标：读取 USER.md 并注入 system prompt。

输入：
- `phase2-design-spec.md` 第 9 章

产出：
- `runtime/prompts.ts` 更新 — `buildSystemPrompt()` 新增 USER.md section
- `BuildSystemPromptOptions` 新增 `userFile` 字段

验收标准：
- 当 `runtime.userFile` 配置指定路径时，从该路径读取
- 否则从 `<workingDirectory>/USER.md` 读取
- 文件不存在时静默跳过
- USER.md 内容在 prompt 中位于 SOUL.md 之后、AGENTS.md 之前
- agent 写入指令包含在 section 中

依赖：
- T09（prompt 顺序协调）

---

### T11. 实现 MEMORY.md 模块

目标：实现 memory 文件的路径管理、读取和 prompt 注入。

输入：
- `phase2-design-spec.md` 第 10 章

产出：
- `runtime/memory.ts`（新文件） — 项目 hash 计算、memory 路径、文件读取、行数截断
- `config/paths.ts` 更新 — 新增 memory 目录路径函数

验收标准：
- 项目 hash 使用 workingDirectory 路径的 SHA-1 前 12 位
- 相同 workingDirectory 总是产生相同 hash
- `readMemory()` 返回截断到 `maxLines` 的内容
- 文件不存在时返回空字符串
- memory 目录自动创建

依赖：无

---

### T12. 将 MEMORY.md 注入 prompt

目标：在 system prompt 组装中加入 MEMORY.md 内容和管理指令。

输入：
- `phase2-design-spec.md` 第 10.6、11 章

产出：
- `runtime/prompts.ts` 更新 — `buildSystemPrompt()` 新增 MEMORY section
- `BuildSystemPromptOptions` 新增 `memoryContent` 和 `memoryFilePath` 字段

验收标准：
- MEMORY.md 内容在 prompt 中位于 AGENTS.md 之后、prompt-only skills 之前
- section 包含记忆管理指令（何时写入、组织方式、内容限制）
- section 包含 memory 文件的绝对路径（agent 需要知道写入位置）
- memory 内容为空时，section 仍包含管理指令和路径
- memory 禁用时，不注入任何 section

依赖：
- T09、T10（prompt 顺序协调）
- T11（memory 模块）

---

### T13. 串接 bootstrap — 透传所有 Phase 2 配置

目标：更新 `daemon/bootstrap.ts` 的 `buildAgentRunOptions()`，将所有 Phase 2 配置传入 agent service。

输入：
- `phase2-design-spec.md` 第 13 章

产出：
- `daemon/bootstrap.ts` 更新
- `runtime/agent-service.ts` `AgentRunOptions` 更新

验收标准：
- `mcpServers` 从 `config.mcp.servers` 透传
- `sdkNativeSkills` 从 `config.skills.sdkNative` 透传
- `agents` 从 `config.agents` 透传
- `soulFile` 从 `config.runtime.soulFile` 透传
- `userFile` 从 `config.runtime.userFile` 透传
- `memoryEnabled` 从 `config.memory.enabled` 透传
- `memoryMaxLines` 从 `config.memory.maxLines` 透传
- 所有字段缺省时，行为与 Phase 1 一致

依赖：
- T06（MCP 透传）
- T07（Skills 开关）
- T08（SubAgents 构建）
- T09（SOUL.md）
- T10（USER.md）
- T12（MEMORY.md 注入）

---

### T14. 端到端集成 — agent-service 组装

目标：在 `agent-service.ts` 的 `handleMessage()` 中将所有 Phase 2 参数正确组装并传入 `queryAgent()`。

输入：
- Phase 2 全部能力模块

产出：
- `runtime/agent-service.ts` 更新
- `runtime/sdk.ts` `QueryRequest` 类型更新

验收标准：
- MCP servers、agents、settingSources 正确传入 `query()`
- SOUL.md + USER.md + MEMORY.md 正确注入 prompt
- allowedTools 包含 MCP wildcards、Skill、Agent（按配置）
- 未配置任何 Phase 2 选项时，`query()` 参数与 Phase 1 完全一致

依赖：
- T13（bootstrap 透传）

---

### T15. config schema 测试

目标：为所有 Phase 2 新增配置段编写测试。

产出：
- `test/config-schema-phase2.test.ts`（或扩展现有测试文件）

验收标准：
- MCP stdio/HTTP/SSE server 配置解析正确
- MCP server 缺少必填字段时校验失败
- agent 缺少 description 时校验失败
- agent 缺少 prompt 和 promptFile 时校验失败
- memory 默认值正确
- skills.sdkNative 默认为 true
- 空配置时所有新增段有正确默认值
- 完整 Phase 1 配置通过校验不回归

依赖：
- T01、T02、T03、T04

---

### T16. tool policy 测试

目标：为 `allowedTools` 合并逻辑编写测试。

产出：
- `test/tool-policy-phase2.test.ts`（或扩展现有测试文件）

验收标准：
- 无 MCP、无 agents、sdkNative=false 时，输出与 Phase 1 一致
- 配置 MCP server 后，输出包含对应通配符
- sdkNative=true 时，输出包含 `"Skill"`
- 配置 agents 后，输出包含 `"Agent"`
- 用户手动在 availableTools 中包含 `"Agent"` 时不重复
- 多个 MCP server 时，每个 server 都有对应通配符

依赖：
- T05

---

### T17. prompt 组装测试

目标：为 Phase 2 的 prompt 组装顺序编写测试。

产出：
- `test/prompts-phase2.test.ts`（或扩展现有测试文件）

验收标准：
- SOUL.md 位于 AGENTS.md 之前
- USER.md 位于 SOUL.md 之后、AGENTS.md 之前
- MEMORY.md 位于 AGENTS.md 之后、skills 之前
- 各 section 缺失文件时静默跳过
- memory 禁用时不包含 memory section
- 全部文件缺失时，输出与 Phase 1 一致

依赖：
- T09、T10、T12

---

### T18. memory 模块测试

目标：为 memory 路径计算、文件读取、行数截断编写测试。

产出：
- `test/memory.test.ts`

验收标准：
- 相同 workingDirectory 产生相同 project hash
- 不同 workingDirectory 产生不同 project hash
- `readMemory()` 截断到 maxLines
- 文件不存在时返回空字符串
- memory 目录不存在时自动创建

依赖：
- T11

---

### T19. SubAgents 构建测试

目标：为 subagent 配置构建逻辑编写测试。

产出：
- `test/agents.test.ts`

验收标准：
- `prompt` 字段正确传入 SDK AgentDefinition
- `promptFile` 内容被读取并填入 `prompt`
- `promptFile` 使用相对路径时，相对于 workingDirectory 解析
- `promptFile` 文件不存在时抛出错误
- `mcpServers` 字符串引用被正确解析为 server 配置
- `mcpServers` 引用不存在的 server 时抛出错误

依赖：
- T08

---

### T20. IPC config set 兼容性

目标：确保 `config set` IPC 路由支持 Phase 2 新增的配置路径。

输入：
- Phase 1 已有的 `POST /v1/config/set` 路由

产出：
- 如有需要，更新 IPC config handler

验收标准：
- `baliclaw config set mcp.servers.github.command npx` 可用
- `baliclaw config set memory.enabled false` 可用
- `baliclaw config set skills.sdkNative false` 可用
- 设置非法值时返回校验错误

依赖：
- T01、T02、T03、T04

---

### T21. 更新 CLAUDE.md

目标：更新项目文档反映 Phase 2 架构。

产出：
- `CLAUDE.md` 更新

验收标准：
- 架构描述包含 MCP、Skills、SubAgents
- 消息流描述包含 SOUL.md/USER.md/MEMORY.md 注入
- Key Modules 部分包含新增模块
- Conventions 部分包含 Phase 2 约定

依赖：
- T14（所有能力集成完毕）

---

## 5. 推荐执行顺序

```
阶段 A — 配置基础设施（可并行）
  T01 + T02 + T03 + T04

阶段 B — 核心机制
  T05 (tool policy，依赖 A)
  T09 + T10 (SOUL.md + USER.md，无依赖)
  T11 (memory 模块，无依赖)

阶段 C — SDK 集成（可部分并行）
  T06 (MCP 透传)
  T07 (Skills 开关)
  T08 (SubAgents 构建)
  T12 (MEMORY.md prompt 注入)

阶段 D — 串接
  T13 (bootstrap 透传)
  T14 (agent-service 组装)

阶段 E — 测试与收尾（可并行）
  T15 + T16 + T17 + T18 + T19
  T20 (IPC 兼容性)
  T21 (CLAUDE.md)
```

可并行项：

- T01 / T02 / T03 / T04 互不依赖
- T09 / T10 / T11 互不依赖
- T06 / T07 / T08 可部分并行（各自依赖不同 schema）
- T15 / T16 / T17 / T18 / T19 互不依赖

---

## 6. 阶段性验收清单

### 阶段 A 验收：配置基础

- `pnpm build` 通过
- `pnpm test` 所有现有测试通过
- 空配置的默认值正确

### 阶段 B 验收：核心机制

- tool policy 在 Phase 1 配置下输出不变
- SOUL.md / USER.md 可被正确读取并注入 prompt
- memory 路径计算和文件读取正确

### 阶段 C 验收：SDK 集成

- MCP servers 配置正确传入 `query()`
- `settingSources` 按 Skills 开关正确设置
- SubAgents 配置正确构建并传入 `query()`
- MEMORY.md 内容和管理指令正确注入 prompt

### 阶段 D 验收：端到端

- 不配置任何 Phase 2 选项时，行为与 Phase 1 完全一致
- 配置所有 Phase 2 选项时，`query()` 参数包含所有新增字段
- agent 回复风格符合 SOUL.md（人工验证）
- agent 可写入 MEMORY.md（人工验证）

### 阶段 E 验收：测试与文档

- 所有新增测试通过
- CLAUDE.md 反映 Phase 2 架构
- `baliclaw config set` 支持 Phase 2 配置路径

---

## 7. 不应偏离的实现约束

- 不破坏 Phase 1 的任何行为和测试
- 不引入 Phase 2 设计规格中"明确的不做事项"里的任何能力
- MCP/Skills/SubAgents 的核心逻辑由 SDK 完成，BaliClaw 只做配置透传
- 不为 MEMORY.md/USER.md 实现自定义 MCP server 或工具
- 不在日志中记录 MCP server env 值或其他凭证
- 所有新增配置段都有合理默认值，空配置时零回归
