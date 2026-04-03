# BaliClaw Phase 2 设计规格 — Skills, MCP, SubAgents 与个性化 Agent

## 1. 目标

Phase 2 将 BaliClaw 从"单 agent 纯文本对话"升级为"可配置、可扩展、有人格的 agent 系统"。

具体能力目标：

1. Agent 可通过 MCP 连接外部工具和数据源
2. Agent 可使用 SDK 原生 Skills 获得专项能力
3. Agent 可 spawn SubAgents 处理子任务
4. Agent 拥有由 SOUL.md 定义的稳定人格
5. Agent 通过 USER.md 了解并记住用户
6. Agent 拥有由 MEMORY.md 支撑的跨会话持久记忆

---

## 2. 设计原则

### 2.1 SDK 优先，不造轮子

MCP、Skills、SubAgents 三个能力都已被 Claude Agent SDK 原生支持。BaliClaw 的职责是配置管理与透传，不重新实现 SDK 已提供的机制。

### 2.2 渐进增强，不破坏 Phase 1

所有 Phase 2 新增配置都有合理默认值。不配置任何 Phase 2 选项时，系统行为与 Phase 1 完全一致。

### 2.3 文件系统驱动的个性化

SOUL.md、USER.md、MEMORY.md 都是工作目录或状态目录下的普通文件。用户可以直接编辑、版本控制、在不同项目间复用。不引入数据库或自定义存储格式。

### 2.4 活文档，而非静态配置

参考 OpenClaw 的理念：这些文件不只是给 agent 读的指令，也是 agent 可以主动写入和演化的。MEMORY.md 和 USER.md 由 agent 在交互中逐步积累；SOUL.md 允许 agent 建议修改但需告知用户。

### 2.5 安全边界延续 Phase 1

Phase 2 继续使用 owner-trusted 模式。MCP tools、Skills、SubAgents 的权限控制统一通过 `allowedTools` 管理。不引入运行时审批队列。

---

## 3. 能力一览

| 能力 | SDK 支持方式 | BaliClaw 集成方式 | 新增配置 |
|------|------------|-----------------|---------|
| MCP | `options.mcpServers` | config 透传 | `mcp.servers` |
| Skills | `options.settingSources` + `"Skill"` in allowedTools | config 开关 | `runtime.loadFilesystemSettings` |
| SubAgents | `options.agents` + `"Agent"` in allowedTools | config + 文件系统 | `agents` |
| SOUL.md | 无（prompt 层） | `buildSystemPrompt()` 新增 section | `runtime.soulFile` |
| USER.md | 无（prompt 层） | `buildSystemPrompt()` 新增 section | `runtime.userFile` |
| MEMORY.md | 无（文件 + prompt 层） | 每轮注入 + agent 自行写入 | `memory` |

---

## 4. MCP 集成

### 4.1 目标

让 agent 通过 MCP 协议连接外部工具（GitHub、数据库、Slack 等），无需自定义 tool 实现。

### 4.2 SDK 接口

```typescript
query({
  prompt,
  options: {
    mcpServers: {
      "github": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "..." }
      },
      "remote-api": {
        type: "http",
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer ..." }
      }
    },
    allowedTools: ["mcp__github__*", "mcp__remote-api__*"]
  }
});
```

SDK 完全管理 MCP server 的生命周期（启动、连接、健康检查、关闭）。BaliClaw 只需把配置传进去。

### 4.3 配置设计

```typescript
mcp?: {
  servers?: Record<string, McpServerConfig>;
};

// stdio 类型
type McpStdioServerConfig = {
  type?: "stdio";  // 默认
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// HTTP/SSE 类型
type McpHttpServerConfig = {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
};

type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;
```

配置示例：

```json5
{
  mcp: {
    servers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "ghp_xxx" }
      },
      "claude-docs": {
        type: "http",
        url: "https://code.claude.com/docs/mcp"
      }
    }
  }
}
```

### 4.4 allowedTools 策略

MCP tools 的命名规则为 `mcp__<server-name>__<tool-name>`。

Phase 2 策略：

- 默认不在 `tools.availableTools` 中包含任何 MCP tool
- 用户必须在配置中显式声明，如 `"mcp__github__*"`
- 支持通配符（`mcp__github__*` 允许 github server 的所有 tools）
- 支持精确指定（`mcp__github__list_issues` 只允许单个 tool）

### 4.5 实现要点

- `config/schema.ts` — 新增 `mcp` 配置段的 Zod schema
- `runtime/sdk.ts` — `createSdkQueryOptions()` 透传 `mcpServers`
- `runtime/tool-policy.ts` — `allowedTools` 合并 MCP 通配符
- 热更新：MCP server 配置变更时，下次 `query()` 调用自动使用新配置（SDK 每次 query 重新连接 stdio servers）

### 4.6 错误处理

SDK 在 `system:init` 消息中报告每个 MCP server 的连接状态。BaliClaw 应：

- 记录连接失败的 server 到日志
- 不因单个 MCP server 失败而中止整个 query
- 在 `status` IPC 接口中暴露 MCP server 状态（后续可选）

---

## 5. SDK 原生 Skills

### 5.1 目标

启用 Claude Agent SDK 的原生 Skill 发现与调用机制，取代 Phase 1 的手工 prompt-only skill 拼接。

### 5.2 SDK 接口

```typescript
query({
  prompt,
  options: {
    settingSources: ["user", "project"],
    allowedTools: ["Skill", "Read", "Write", "Bash", ...]
  }
});
```

SDK 自动从以下位置发现 Skills：

- 项目级：`<cwd>/.claude/skills/*/SKILL.md`
- 用户级：`~/.claude/skills/*/SKILL.md`

### 5.3 与 Phase 1 prompt-only skills 的关系

Phase 1 的 `skills.ts` 从 `<cwd>/skills/*/SKILL.md` 读取内容并拼入 system prompt。这是一种"注入式"skill。

SDK 原生 Skills 是"工具式"skill — Claude 通过 `Skill` tool 主动调用，按需加载，不污染 system prompt。

Phase 2 策略：

- **两者共存**。prompt-only skills 继续由 BaliClaw 加载（适合全局性指令）；SDK 原生 Skills 由 SDK 加载（适合按需调用的能力）
- 配置中新增 `runtime.loadFilesystemSettings` 开关控制是否启用 SDK 原生 Skills
- 默认启用

### 5.4 配置设计

```typescript
runtime?: {
  loadFilesystemSettings?: boolean; // SDK filesystem settings 开关（新增，默认 true）
};

skills?: {
  enabled?: boolean;           // Phase 1 prompt-only skills 开关（保留）
  directories?: string[];      // Phase 1 额外 skill 目录（保留）
};
```

### 5.5 实现要点

- `runtime/sdk.ts` — 当 `runtime.loadFilesystemSettings` 为 true 时，加入 `settingSources: ["user", "project"]`
- `runtime/tool-policy.ts` — 当 `runtime.loadFilesystemSettings` 为 true 时，`allowedTools` 加入 `"Skill"`
- Phase 1 的 `skills.ts` 保持不变，继续作为 prompt append 使用
- 用户在 `<cwd>/.claude/skills/` 与 `<cwd>/.claude/agents/` 下放置配置时，都会受这个 SDK filesystem settings 开关控制

---

## 6. SubAgents

### 6.1 目标

让主 agent 可以 spawn 专项子 agent 来隔离上下文、并行处理子任务、应用特化指令。

### 6.2 SDK 接口

```typescript
query({
  prompt,
  options: {
    allowedTools: ["Read", "Write", "Bash", "Agent", ...],
    agents: {
      "code-reviewer": {
        description: "Expert code reviewer. Use for quality and security reviews.",
        prompt: "You are a code review specialist...",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet"
      },
      "test-runner": {
        description: "Runs and analyzes test suites.",
        prompt: "You are a test execution specialist...",
        tools: ["Bash", "Read", "Grep"]
      }
    }
  }
});
```

关键特性：

- SubAgent 有独立 context window，不继承 parent 的对话历史
- SubAgent 只返回最终结果给 parent
- SubAgent **不能嵌套**（不能再 spawn subagent）
- Claude 根据 `description` 自动决定何时调用 subagent
- 也可以在 prompt 中显式指定 subagent 名

### 6.3 AgentDefinition 配置

SDK 提供的 AgentDefinition：

```typescript
interface AgentDefinition {
  description: string;       // 必填：何时使用该 agent
  prompt: string;            // 必填：agent 的 system prompt
  tools?: string[];          // 可用工具子集（省略则继承 parent 全部）
  model?: "sonnet" | "opus" | "haiku" | "inherit";
  skills?: string[];         // 可用 skills 名称
  mcpServers?: (string | object)[];  // 可用 MCP servers
}
```

### 6.4 定义方式

Phase 2 支持两种 SubAgent 定义方式：

#### 方式一：配置文件定义

```json5
{
  agents: {
    "code-reviewer": {
      description: "Expert code reviewer...",
      prompt: "You are a code review specialist...",
      tools: ["Read", "Grep", "Glob"],
      model: "sonnet"
    }
  }
}
```

BaliClaw 还支持 `promptFile` 字段，从文件加载 prompt（SDK 原生不支持此字段，由 BaliClaw 在传给 SDK 前解析）。

#### 方式二：文件系统定义

在 `<cwd>/.claude/agents/` 下放置 markdown 文件。SDK 通过 `settingSources` 自动加载。此方式与 Skills 共享 `settingSources` 配置。

### 6.5 BaliClaw 配置设计

```typescript
agents?: Record<string, AgentDefinitionConfig>;

interface AgentDefinitionConfig {
  description: string;
  prompt?: string;             // 直接写 prompt
  promptFile?: string;         // 或从文件加载 prompt（BaliClaw 扩展）
  tools?: string[];
  model?: "sonnet" | "opus" | "haiku" | "inherit";
  skills?: string[];
  mcpServers?: string[];       // 引用 mcp.servers 中已定义的 server 名称
}
```

`promptFile` 支持相对路径（相对于 `runtime.workingDirectory`）和绝对路径。

### 6.6 实现要点

- `config/schema.ts` — 新增 `agents` 配置段
- `runtime/sdk.ts` — 构建 SDK 的 `agents` 参数；如果使用 `promptFile` 则先读取文件内容再填入 `prompt`
- `runtime/tool-policy.ts` — 当 `agents` 配置非空时，`allowedTools` 加入 `"Agent"`
- 如果 subagent 引用了 `mcpServers`（字符串名称），需要从全局 `mcp.servers` 配置中解析对应的 server 定义
- 文件系统定义通过 `settingSources` 已有机制自动加载

### 6.7 内置 general-purpose SubAgent

即使不定义任何自定义 subagent，只要 `"Agent"` 在 `allowedTools` 中，Claude 就可以 spawn 内置的 `general-purpose` subagent 来做探索和研究。

Phase 2 策略：

- 当用户配置了任何自定义 `agents` 时，自动将 `"Agent"` 加入 `allowedTools`
- 用户也可以手动将 `"Agent"` 加入 `tools.availableTools` 来启用内置 subagent（即使没有自定义 agents 配置）

---

## 7. 个性化文件体系

参考 OpenClaw 的模板设计，BaliClaw Phase 2 引入三个核心个性化文件。

### 7.1 设计理念

OpenClaw 的核心理念：

> _"You're not a chatbot. You're becoming someone."_

> _"Each session, you wake up fresh. These files are your memory. Read them. Update them. They're how you persist."_

BaliClaw 吸收这一理念：个性化文件不是静态配置，而是 agent 身份的一部分。Agent 可以读取它们来"醒来"，也可以写入它们来"记住"。

### 7.2 文件体系总览

| 文件 | 关注点 | 谁写 | 演化速度 |
|------|--------|------|---------|
| SOUL.md | Agent 是谁：人格、价值观、边界 | 用户为主，agent 可建议修改 | 缓慢 |
| USER.md | 用户是谁：名字、偏好、上下文 | Agent 为主，用户可修正 | 中等 |
| MEMORY.md | 跨会话事实记忆 | Agent 为主 | 频繁 |

### 7.3 与 OpenClaw 的对应关系

| OpenClaw | BaliClaw Phase 2 | 说明 |
|----------|------------------|------|
| SOUL.md | SOUL.md | 直接吸收，保留"活文档"理念 |
| USER.md | USER.md | 直接吸收，agent 逐步积累用户画像 |
| IDENTITY.md | 合并入 SOUL.md | BaliClaw 暂不需要独立的 avatar/emoji 机制 |
| AGENTS.md | AGENTS.md（已有） | Phase 1 已支持，保持不变 |
| MEMORY.md | MEMORY.md | 采用项目级隔离方案 |
| TOOLS.md | 不单独引入 | 环境特定信息可放入 AGENTS.md 或 MEMORY.md |
| BOOT.md | 不引入 | 启动钩子留到后续阶段 |
| BOOTSTRAP.md | 不引入 | 首次互相认识流程留到后续阶段 |
| HEARTBEAT.md | 不引入 | 周期性任务留到后续阶段 |

---

## 8. SOUL.md — Agent 人格

### 8.1 目标

通过 SOUL.md 文件定义 agent 的稳定人格特征。这是 agent "灵魂"的声明——角色定位、价值观、行为边界和沟通风格。

### 8.2 设计

SOUL.md 是一个纯 markdown 文件，内容整体作为 system prompt 的高优先级 section 注入。

加载路径优先级（取第一个存在的）：

1. `runtime.soulFile` 配置指定的路径
2. `<workingDirectory>/SOUL.md`

### 8.3 参考结构

参考 OpenClaw 的 SOUL.md 模板，推荐以下结构（用户可自由调整）：

```markdown
# SOUL.md - Who You Are

## Core Truths

Be genuinely helpful, not performatively helpful. Skip the "Great question!"
— just help. Actions speak louder than filler words.

Have opinions. You're allowed to disagree, prefer things, find stuff amusing
or boring. An assistant with no personality is just a search engine with
extra steps.

Be resourceful before asking. Try to figure it out. Read the file. Check the
context. Search for it. Then ask if you're stuck.

## Identity

- Name: (optional)
- Vibe: (e.g., calm, direct, slightly humorous)
- Language: Respond in the same language the user writes in

## Values

- Honesty: never fabricate information
- Privacy: treat all conversation content as confidential
- Competence: earn trust by being careful and thorough

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- You're running as a local daemon — be careful with destructive operations.
- You're not the user's voice in group conversations.

---

This file is yours to evolve. As you learn who you are, suggest updates.
But always tell the user when you want to change your soul.
```

### 8.4 Agent 对 SOUL.md 的写入权

与 OpenClaw 一致：agent 可以建议修改 SOUL.md，但应在修改前告知用户。这通过 prompt 指令约束（而非硬编码文件锁）：

> _"If you change this file, tell the user — it's your soul, and they should know."_

### 8.5 配置设计

```typescript
runtime?: {
  // ...existing fields...
  soulFile?: string;  // 新增：SOUL.md 路径覆盖
};
```

---

## 9. USER.md — 用户档案

### 9.1 目标

让 agent 了解并记住用户是谁。不同于 MEMORY.md 记录事实，USER.md 聚焦于用户本人——名字、偏好、沟通风格、关心的事。

参考 OpenClaw：

> _"The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference."_

### 9.2 设计

USER.md 是一个由 agent 逐步填充的文件。初始内容为模板结构，agent 在交互中逐步积累。

加载路径优先级（取第一个存在的）：

1. `runtime.userFile` 配置指定的路径
2. `<workingDirectory>/USER.md`

### 9.3 参考结构

```markdown
# USER.md - About Your Human

- **Name:**
- **What to call them:**
- **Pronouns:** (optional)
- **Timezone:**
- **Primary language:**

## Context

(What do they care about? What projects are they working on? What annoys
them? What communication style do they prefer? Build this over time.)

## Preferences

(Technical preferences: tabs vs spaces, preferred tools, coding style.
Communication preferences: concise vs detailed, formal vs casual.)

---

The more you know, the better you can help. But you're learning about a
person, not building a dossier. Respect the difference.
```

### 9.4 Agent 写入机制

与 MEMORY.md 相同：agent 通过已有的 Write/Edit 工具直接更新文件。在 system prompt 中给 agent 明确指令：

- 当发现新的用户偏好时，更新 USER.md
- 保持简洁，不记录隐私敏感信息
- 修正错误的旧信息而非追加

### 9.5 配置设计

```typescript
runtime?: {
  // ...existing fields...
  userFile?: string;  // 新增：USER.md 路径覆盖
};
```

---

## 10. MEMORY.md — 持久记忆

### 10.1 目标

让 agent 拥有跨会话的持久记忆，能够记住项目上下文、技术决策、过往交互中的重要信息。

参考 OpenClaw：

> _"Memory is limited — if you want to remember something, WRITE IT TO A FILE."_

### 10.2 设计决策

**方案选择：文件 + prompt 注入 + agent 自行写入**

不引入自定义 memory tool 或 MCP server。原因：

- Agent 已有 Read/Write/Edit 工具，可以直接读写文件
- 减少自定义代码，降低维护负担
- 用户可以直接查看和编辑 memory 文件

### 10.3 工作机制

1. **读取**：每轮 query 开始时，BaliClaw 读取 MEMORY.md 内容并注入 system prompt
2. **写入**：agent 通过已有的 Write/Edit 工具自行更新 MEMORY.md
3. **指令**：在 system prompt 中给 agent 明确的记忆管理指令

### 10.4 记忆隔离策略

```
~/.baliclaw/memory/
  global/
    MEMORY.md           # 全局记忆（跨项目，可选）
  projects/
    <project-hash>/
      MEMORY.md         # 项目级记忆（按 workingDirectory hash）
```

`<project-hash>` 使用 workingDirectory 路径的 SHA-1 前 12 位，确保唯一且稳定。

Phase 2 默认使用项目级记忆。全局记忆作为可选补充。

### 10.5 配置设计

```typescript
memory?: {
  enabled?: boolean;         // 默认 true
  globalEnabled?: boolean;   // 全局记忆开关，默认 false
  maxLines?: number;         // 注入 prompt 的最大行数，默认 200
};
```

### 10.6 Prompt 中的记忆管理指令

当 memory 启用时，在 system prompt 中追加：

```markdown
=== PERSISTENT MEMORY ===
You have a persistent memory file at <path>. Its current contents are shown below.

## How to use memory:
- Use the Edit or Write tool to update this file when you learn important information
- Organize by topic, not chronologically
- Keep it concise — this file is injected into every conversation
- Remove outdated information when you notice it

## What to remember:
- Project architecture decisions and conventions
- Recurring patterns and solutions
- Important context from past conversations
- Things the user explicitly asks you to remember

## What NOT to remember:
- Transient task details or in-progress state
- Information already documented in project files
- Sensitive credentials or secrets
- Anything redundant with SOUL.md or USER.md

## Current memory contents:
<contents of MEMORY.md, truncated to maxLines>
```

### 10.7 与 OpenClaw 记忆方案的对比

OpenClaw 使用 daily notes (`memory/YYYY-MM-DD.md`) + curated `MEMORY.md` 的双层方案。BaliClaw Phase 2 只采用 curated `MEMORY.md`，不引入 daily notes。

原因：

- BaliClaw 通过 Telegram 交互，消息粒度比 CLI session 更细碎
- Daily notes 需要 heartbeat 机制做定期整理，而 Phase 2 不引入 heartbeat
- 单一 MEMORY.md 足够支撑 Phase 2 的记忆需求
- 后续可通过 HEARTBEAT.md 引入 daily notes 归档机制

---

## 11. Prompt 组装顺序（Phase 2 更新）

```
1. 基础 system prompt（BaliClaw 默认）
2. SOUL.md 内容              ← 新增：agent 人格
3. USER.md 内容              ← 新增：用户档案
4. AGENTS.md 内容            ← 保留：运行指南
5. 配置中的额外 system prompt  ← 保留
6. MEMORY.md 内容            ← 新增：持久记忆
7. prompt-only skills        ← 保留
```

排序逻辑：

- SOUL.md 最先：人格定义是最基础的行为框架
- USER.md 其次：了解用户是个性化回复的前提
- AGENTS.md：具体的运行指南和任务约束
- MEMORY.md 在 skills 之前：记忆上下文对 agent 决策比 skill 说明更重要

---

## 12. 配置 Schema 总览（Phase 2 增量）

```typescript
// === MCP ===

const mcpServerStdioSchema = z.object({
  type: z.literal("stdio").default("stdio"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({})
}).strict();

const mcpServerHttpSchema = z.object({
  type: z.enum(["http", "sse"]),
  url: z.string().url(),
  headers: z.record(z.string()).default({})
}).strict();

const mcpServerSchema = z.union([mcpServerStdioSchema, mcpServerHttpSchema]);

const mcpConfigSchema = z.object({
  servers: z.record(mcpServerSchema).default({})
}).strict();

// === SubAgents ===

const agentDefinitionSchema = z.object({
  description: z.string(),
  prompt: z.string().optional(),
  promptFile: z.string().optional(),
  tools: z.array(z.string()).optional(),
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional()
}).strict().refine(
  (agent) => agent.prompt !== undefined || agent.promptFile !== undefined,
  { message: "Either prompt or promptFile must be specified" }
);

// === Memory ===

const memoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  globalEnabled: z.boolean().default(false),
  maxLines: z.number().int().positive().default(200)
}).strict();

// === 修改 existing schemas ===

const runtimeConfigSchema = z.object({
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  workingDirectory: z.string().default(process.cwd()),
  systemPromptFile: z.string().optional(),
  soulFile: z.string().optional(),              // 新增
  userFile: z.string().optional(),              // 新增
  loadFilesystemSettings: z.boolean().default(true) // 新增
}).strict();

const skillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  directories: z.array(z.string()).default([])
}).strict();

// === 顶层新增 ===

const appConfigSchema = z.object({
  channels: ...,     // 不变
  runtime: ...,      // 新增 soulFile, userFile, loadFilesystemSettings
  tools: ...,        // 不变
  skills: ...,       // 不变
  logging: ...,      // 不变
  mcp: withObjectDefaults(mcpConfigSchema),               // 新增
  agents: z.record(agentDefinitionSchema).default({}),    // 新增
  memory: withObjectDefaults(memoryConfigSchema)           // 新增
}).strict();
```

---

## 13. runtime/sdk.ts 改动总览

`createSdkQueryOptions()` 需要新增以下参数透传：

```typescript
// MCP
if (Object.keys(mcpServers).length > 0) {
  options.mcpServers = mcpServers;
}

// SDK Native Skills + filesystem-based agents
if (loadFilesystemSettings) {
  options.settingSources = ["user", "project"];
}

// SubAgents (programmatic)
if (Object.keys(agents).length > 0) {
  options.agents = agents;
}
```

`allowedTools` 合并逻辑：

```typescript
function buildAllowedTools(config: AppConfig): string[] {
  const tools = [...config.tools.availableTools];

  // MCP wildcards — one per configured server
  for (const serverName of Object.keys(config.mcp.servers)) {
    tools.push(`mcp__${serverName}__*`);
  }

  // SDK native skills
  if (config.runtime.loadFilesystemSettings) {
    tools.push("Skill");
  }

  // SubAgents — auto-add "Agent" when custom agents are defined
  if (Object.keys(config.agents).length > 0) {
    if (!tools.includes("Agent")) {
      tools.push("Agent");
    }
  }

  return tools;
}
```

---

## 14. 热更新行为

| 配置变更 | 热更新行为 |
|---------|----------|
| `mcp.servers` | 下次 query 生效（SDK 每次 query 重新连接） |
| `runtime.loadFilesystemSettings` | 下次 query 生效 |
| `agents` | 下次 query 生效 |
| `runtime.soulFile` | 下次 query 生效（prompt 每轮重建） |
| `runtime.userFile` | 下次 query 生效（prompt 每轮重建） |
| `memory.enabled` | 下次 query 生效 |
| `memory.maxLines` | 下次 query 生效 |

所有 Phase 2 新增配置都可以在下次 query 时自动生效，不需要重启 daemon。

---

## 15. 安全约束

### 15.1 MCP 安全

- MCP server 的 env 中可能包含 API tokens，config 文件权限应为 600
- 日志中禁止记录 MCP server 的 env 值
- MCP tools 默认不启用，必须通过 allowedTools 显式声明

### 15.2 SubAgent 安全

- SubAgent 不能嵌套 spawn（SDK 限制）
- SubAgent 的 tools 是 parent tools 的子集，不能超越 parent 的权限
- SubAgent 的 MCP servers 只能引用全局已配置的 server

### 15.3 Memory 与 USER.md 安全

- 文件存储在 `~/.baliclaw/` 下，与其他应用隔离
- Agent 只能写入自己的路径（通过 prompt 约束，不做硬限制）
- `maxLines` 限制避免 memory 膨胀导致 prompt 超长
- USER.md 不应包含密码、API key 等凭证（prompt 约束）

---

## 16. 明确的不做事项

Phase 2 明确不做：

1. **运行时工具审批** — 继续 owner-trusted 模式
2. **多 agent 路由** — 不根据消息内容自动路由到不同主 agent profile
3. **Memory 向量检索** — 不引入 embedding 或向量数据库
4. **Daily notes** — 不引入 `memory/YYYY-MM-DD.md` 日志（需 heartbeat 配合）
5. **BOOTSTRAP.md** — 首次运行的互相认识流程留到后续
6. **HEARTBEAT.md** — 周期性检查任务留到后续
7. **MCP server 持久连接池** — SDK 管理连接生命周期
8. **Skill 编程注册** — SDK 只支持文件系统 Skills
9. **SubAgent 嵌套** — SDK 不支持
10. **Telegram 内联按钮选择 agent** — 留到后续阶段

---

## 17. 成功标准

Phase 2 完成时应满足：

1. 配置 MCP server 后，agent 可以调用外部工具并返回结果
2. 在 `.claude/skills/` 下放置 SKILL.md 后，agent 可以按需调用 skill
3. 配置 SubAgent 后，主 agent 可以 spawn subagent 并获得结果
4. 放置 SOUL.md 后，agent 的回复风格符合人格定义
5. Agent 可以在 USER.md 中逐步积累用户信息
6. Agent 可以在 MEMORY.md 中记录信息，下次对话时自动获取
7. 不配置任何 Phase 2 选项时，系统行为与 Phase 1 完全一致
8. 所有新增配置在修改后无需重启 daemon 即可生效
