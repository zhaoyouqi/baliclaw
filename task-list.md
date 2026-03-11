# BaliClaw Phase 1 任务清单

## 1. 文档目的

本文档将 `tech-spec.md` 拆分为可执行、可验证、可评估的开发任务。

使用原则：

- 每个任务都必须有明确产出
- 每个任务都必须有可操作的验收标准
- 优先保证主链路闭环，再做增强项
- 默认按顺序推进，除非标注为可并行

---

## 2. 总体交付目标

完成 Phase 1 后，系统应满足以下最小闭环：

1. daemon 能启动并加载配置
2. CLI 能通过本地 IPC 查询状态和修改配置
3. Telegram 私聊消息能进入系统
4. 未配对用户会收到 pairing code，且消息不会进入 runtime
5. 已配对用户的消息会调用 Claude Agent SDK
6. 同一用户多轮消息使用稳定 `sessionId`
7. Agent 最终回复会回发到 Telegram

---

## 3. 里程碑拆分

### M1. 工程骨架与运行框架

目标：

- 把项目跑起来
- 明确目录、入口、配置和日志基础设施

完成标准：

- 能启动 `baliclawd`
- 能运行 `baliclaw status`
- 有最小可用的配置加载和日志输出

### M2. 本地控制面闭环

目标：

- 打通 CLI -> IPC -> daemon 的控制链路

完成标准：

- `ping`、`status`、`config get/set` 可用
- 所有写操作都只经过 daemon

### M3. Telegram DM 接入闭环

目标：

- 接收 Telegram DM，并转成统一入站消息

完成标准：

- 只接收 private chat
- handler 收到消息后立即入队返回
- 能向 Telegram 发文本消息

### M4. Pairing / Allowlist 闭环

目标：

- 未授权用户不会进入 runtime
- 本地 CLI 可以审批 pairing

完成标准：

- 未授权用户收到 pairing code
- `pairing list/approve` 可用
- allowlist 持久化可恢复

### M5. Agent Runtime 闭环

目标：

- 将已授权消息送入 Claude Agent SDK 并返回最终结果

完成标准：

- 使用稳定 `sessionId`
- 使用指定 `cwd`
- 使用 owner-trusted 工具模式

### M6. 技能、热更新与加固

目标：

- 补齐 prompt-only skills、配置热更新与关键测试

完成标准：

- skills 生效
- 配置改动可热应用
- 关键路径均有测试覆盖

---

## 4. 任务列表

## T01. 初始化项目结构

目标：

- 按 `tech-spec.md` 建立基础目录和入口文件

输入：

- `tech-spec.md`

产出：

- `src/cli/`
- `src/daemon/`
- `src/ipc/`
- `src/config/`
- `src/telegram/`
- `src/auth/`
- `src/session/`
- `src/runtime/`
- `src/shared/`

验收标准：

- 目录结构与技术规格一致
- 入口文件可被 TypeScript 编译识别
- 无明显循环依赖

依赖：

- 无

---

## T02. 建立基础依赖与脚本

目标：

- 安装并配置运行、构建、测试所需依赖

输入：

- `package.json`
- `tech-spec.md`

产出：

- 依赖声明
- `dev` / `build` / `test` 脚本

验收标准：

- 依赖安装成功
- `pnpm build` 可执行
- `pnpm test` 可执行

依赖：

- T01

---

## T03. 定义共享类型与错误模型

目标：

- 统一核心运行时类型，避免模块间先写先乱

输入：

- `tech-spec.md` 第 7 章

产出：

- `src/shared/types.ts`
- `src/shared/errors.ts` 或等价文件

验收标准：

- 至少定义 `InboundMessage`、`DeliveryTarget`、`PairingRequest`
- IPC 和 runtime 使用同一套类型
- 不出现裸字符串错误码散落在多个模块

依赖：

- T01

---

## T04. 实现路径与状态目录管理

目标：

- 统一管理 `~/.baliclaw/` 下的文件路径

输入：

- `tech-spec.md` 第 6.1 章

产出：

- `src/config/paths.ts`

验收标准：

- 能返回 config、socket、pairing store、log 文件路径
- 能确保必要目录存在
- 不在业务模块里硬编码状态路径

依赖：

- T01

---

## T05. 实现原子写文件工具

目标：

- 为 config 和 store 提供统一的安全写入能力

输入：

- `tech-spec.md` 第 6.4、10.5 章

产出：

- `src/shared/atomic-write.ts`

验收标准：

- 写入采用临时文件 + rename
- 写入失败不会破坏原文件
- 至少有对应单元测试

依赖：

- T01
- T04

---

## T06. 实现配置 schema 与配置服务

目标：

- 支持配置读取、校验、默认值处理和写回

输入：

- `tech-spec.md` 第 6.2、6.3、6.4 章

产出：

- `src/config/schema.ts`
- `src/config/service.ts`
- `src/config/file-store.ts`

验收标准：

- 支持读取 `baliclaw.json5`
- 非法配置会报结构化错误
- `telegram.enabled=true` 且无 token 时校验失败
- 配置写入只走统一 service

依赖：

- T04
- T05

---

## T07. 实现结构化日志

目标：

- 为 daemon、IPC、Telegram、runtime 提供统一日志能力

输入：

- `tech-spec.md` 第 16 章

产出：

- `src/shared/logger.ts`

验收标准：

- 使用 `pino`
- 支持子系统字段
- 默认不输出敏感信息

依赖：

- T01

---

## T08. 搭建 daemon 启动与关闭流程

目标：

- 建立 daemon 生命周期骨架

输入：

- `tech-spec.md` 第 4.1、4.2 章

产出：

- `src/daemon/index.ts`
- `src/daemon/bootstrap.ts`
- `src/daemon/shutdown.ts`

验收标准：

- daemon 能启动
- 启动时加载配置和日志
- 收到退出信号时能有序关闭

依赖：

- T06
- T07

---

## T09. 实现 IPC Server

目标：

- 提供 daemon 的本地控制面入口

输入：

- `tech-spec.md` 第 8 章

产出：

- `src/ipc/server.ts`
- `src/ipc/schema.ts`

验收标准：

- 监听 Unix Domain Socket
- 至少暴露 `GET /v1/ping` 与 `GET /v1/status`
- 错误返回结构化 JSON

依赖：

- T08

---

## T10. 实现 CLI IPC 客户端

目标：

- 让 `baliclaw` 能通过本地 IPC 调用 daemon

输入：

- `tech-spec.md` 第 8.2、8.3 章

产出：

- `src/cli/client.ts`

验收标准：

- 当 socket 不存在时立即失败
- 支持 `ping`、`status`、`config get/set`
- CLI 不直接读写 store

依赖：

- T09

---

## T11. 实现 CLI 命令骨架

目标：

- 提供操作员可用的本地命令入口

输入：

- `tech-spec.md` 第 4.1、8.2 章

产出：

- `src/cli/index.ts`
- `src/cli/commands/daemon.ts`
- `src/cli/commands/config.ts`
- `src/cli/commands/status.ts`

验收标准：

- `baliclaw status` 可用
- `baliclaw config get` 可用
- `baliclaw config set` 可用

依赖：

- T10

---

## T12. 实现 keyed queue

目标：

- 保障同一用户消息按顺序串行处理

输入：

- `tech-spec.md` 第 11.2 章

产出：

- `src/shared/keyed-queue.ts`
- `src/session/turn-queue.ts`

验收标准：

- 同 key 任务严格串行
- 不同 key 任务可并行
- 失败任务不会卡死后续任务

依赖：

- T03

---

## T13. 实现 Telegram 消息标准化

目标：

- 将 Telegram private text message 转换为 `InboundMessage`

输入：

- `tech-spec.md` 第 7 章、第 9 章

产出：

- `src/telegram/normalize.ts`

验收标准：

- 只接受 private chat
- 非文本消息返回忽略结果
- 输出 `channel/accountId/chatType/conversationId/senderId/text`

依赖：

- T03

---

## T14. 实现 Telegram 发送能力

目标：

- 支持向指定 DM 发送文本消息

输入：

- `tech-spec.md` 第 9.4 章

产出：

- `src/telegram/send.ts`

验收标准：

- 只支持文本发送
- 以 `conversationId` 为目标寻址
- 失败时返回可诊断错误

依赖：

- T03

---

## T15. 实现 TelegramService

目标：

- 打通 Telegram 长轮询接入，并把消息异步投递到 daemon

输入：

- `tech-spec.md` 第 9.1、9.2、9.3 章

产出：

- `src/telegram/service.ts`

验收标准：

- 使用 `grammy` 长轮询
- handler 只做轻量校验与入队
- handler 不直接等待 Agent 完整执行
- 忽略 group / supergroup / channel / 非文本消息

依赖：

- T08
- T13
- T14
- T12

---

## T16. 实现 pairing store

目标：

- 持久化 pending request 与 allowlist

输入：

- `tech-spec.md` 第 10.2、10.5 章

产出：

- `src/auth/pairing-store.ts`

验收标准：

- 支持读取和写入 `telegram-pending.json`
- 支持读取和写入 `telegram-allowlist.json`
- 写入使用原子写

依赖：

- T04
- T05
- T03

---

## T17. 实现 PairingService

目标：

- 封装 pairing code 生成、校验、审批和 allowlist 判定逻辑

输入：

- `tech-spec.md` 第 10 章

产出：

- `src/auth/pairing-service.ts`

验收标准：

- 未授权用户可生成或复用 pending pairing code
- pairing code 满足长度、字符集、TTL 规则
- `approve` 成功后 sender 进入 allowlist
- `approve` 成功后 pending request 被删除

依赖：

- T16

---

## T18. 接入 pairing 到 Telegram 入站链路

目标：

- 保证未授权消息不会进入 runtime

输入：

- `tech-spec.md` 第 10.1、10.4 章

产出：

- Telegram 入站主链路中的 pairing gate

验收标准：

- 未授权用户收到 pairing code
- 未授权消息不会触发 SDK
- 已授权用户可以继续进入后续队列

依赖：

- T15
- T17

---

## T19. 实现 SessionService

目标：

- 生成稳定 `sessionId` 并协调 keyed queue

输入：

- `tech-spec.md` 第 11 章

产出：

- `src/session/stable-key.ts`
- `SessionService` 或等价逻辑

验收标准：

- 同一 `senderId` 总是生成同一 `sessionId`
- 不使用 `process.chdir()`
- 相同 `sessionId` 的消息严格串行

依赖：

- T12
- T03

---

## T20. 实现 prompt 组装

目标：

- 将 runtime prompt、`AGENTS.md` 和 skill 内容拼接成最终 system prompt

输入：

- `tech-spec.md` 第 13.4 章

产出：

- `src/runtime/prompts.ts`

验收标准：

- 支持基础 prompt
- 支持读取 `AGENTS.md`
- 支持分隔符拼接

依赖：

- T04

---

## T21. 实现 SkillsService

目标：

- 读取并加载 prompt-only skills

输入：

- `tech-spec.md` 第 13 章

产出：

- `src/runtime/skills.ts`

验收标准：

- 只读取 `SKILL.md`
- 支持工作目录和额外目录
- 不执行 skill 脚本

依赖：

- T20
- T04

---

## T22. 实现工具策略模块

目标：

- 统一生成可传给 SDK 的工具配置

输入：

- `tech-spec.md` 第 14 章

产出：

- `src/runtime/tool-policy.ts`

验收标准：

- 默认工具集为 `Read/Write/Edit/Bash`
- 可由配置覆盖
- Phase 1 不实现 runtime approval queue

依赖：

- T06

---

## T23. 实现 Claude Agent SDK 包装层

目标：

- 提供一层稳定的运行时适配，隔离上层业务与 SDK 细节

输入：

- `tech-spec.md` 第 3.3、12 章

产出：

- `src/runtime/sdk.ts`

验收标准：

- 调用 `query()`
- 显式传入 `sessionId`
- 显式传入 `cwd`
- 显式传入 `permissionMode: "bypassPermissions"`
- 显式传入 `allowDangerouslySkipPermissions: true`
- 禁止调用 `process.chdir()`

依赖：

- T22
- T20

---

## T24. 实现 AgentService

目标：

- 将业务消息转换为 SDK 调用，并提取最终用户可见回复

输入：

- `tech-spec.md` 第 12 章

产出：

- `src/runtime/agent-service.ts`

验收标准：

- 使用稳定 `sessionId`
- 使用指定 `cwd`
- 只从最终 `result` 事件提取用户回复
- 异常时输出用户可读失败信息并记录日志

依赖：

- T19
- T21
- T23
- T07

---

## T25. 打通 Telegram -> Pairing -> Session -> Agent -> Telegram 主链路

目标：

- 完成 Phase 1 的核心消息闭环

输入：

- 前述模块

产出：

- daemon 入站主流程

验收标准：

- 未授权用户进入 pairing 分支
- 已授权用户进入 runtime 分支
- Agent 最终回复能回发到 Telegram
- 同一用户多轮消息可保持上下文

依赖：

- T18
- T19
- T24
- T14

---

## T26. 实现 IPC 的 pairing 接口

目标：

- 提供 `pairing list` 和 `pairing approve` 的 daemon 能力

输入：

- `tech-spec.md` 第 8.2、10.4 章

产出：

- `src/ipc/handlers/pairing.ts`

验收标准：

- `GET /v1/pairing/list?channel=telegram` 可用
- `POST /v1/pairing/approve` 可用
- daemon 处理 approve 后立即刷新内存态

依赖：

- T09
- T17

---

## T27. 实现 CLI pairing 命令

目标：

- 让操作员能通过 CLI 审批 pairing

输入：

- `tech-spec.md` 第 4.1、10.4 章

产出：

- `src/cli/commands/pairing.ts`

验收标准：

- `baliclaw pairing list telegram` 可用
- `baliclaw pairing approve telegram <CODE>` 可用
- CLI 本身不直接写 allowlist

依赖：

- T26
- T10

---

## T28. 实现 ReloadService

目标：

- 支持受控的配置热更新

输入：

- `tech-spec.md` 第 15 章

产出：

- `ReloadService` 或等价模块

验收标准：

- 监听 `baliclaw.json5`
- 配置变化时能重新解析与校验
- logging/runtime prompt/tool config 可热应用
- Telegram token 变化时可重启 polling service

依赖：

- T06
- T15
- T20
- T22

---

## T29. 补齐状态与配置类 IPC

目标：

- 让 CLI 能查询和修改运行状态

输入：

- `tech-spec.md` 第 8.2 章

产出：

- `src/ipc/handlers/config.ts`
- `src/ipc/handlers/status.ts`

验收标准：

- `GET /v1/status` 可用
- `GET /v1/config` 可用
- `POST /v1/config/set` 可用

依赖：

- T09
- T06

---

## T30. 补齐测试

目标：

- 为关键路径建立最低可信回归保护

输入：

- `tech-spec.md` 第 18 章

产出：

- 单元测试
- 集成测试

验收标准：

- 至少覆盖：
  - 配置校验
  - pairing store
  - 稳定 `sessionId`
  - keyed queue
  - prompt 组装
  - handler 入队即返回
  - 未配对不触发 SDK
  - 已配对触发 SDK 并返回结果
  - `cwd` 正确透传且不污染并发会话

依赖：

- T06
- T12
- T17
- T19
- T20
- T23
- T25

---

## 5. 推荐执行顺序

建议按以下顺序推进：

1. `T01` - `T08`
2. `T09` - `T11`
3. `T12` - `T18`
4. `T19` - `T25`
5. `T26` - `T30`

可并行项：

- `T07` 可与 `T06` 并行
- `T13` 与 `T16` 可并行
- `T20` 与 `T22` 可并行

---

## 6. 阶段性验收清单

### 阶段 A：基础设施验收

- `baliclawd` 能启动
- `baliclaw status` 能返回结构化状态
- 配置文件可以被读取和校验

### 阶段 B：接入与授权验收

- Telegram 私聊消息可进入系统
- 非私聊消息被忽略
- 未授权用户只能收到 pairing code
- 操作员可通过 CLI 完成 approve

### 阶段 C：Agent 闭环验收

- 已授权用户消息触发 Claude Agent SDK
- 相同用户消息使用相同 `sessionId`
- 回复能回发到 Telegram

### 阶段 D：稳定性验收

- daemon 重启后 allowlist 保留
- 配置热更新可生效
- 关键集成测试通过

---

## 7. 不应偏离的实现约束

- 不要引入 Web UI
- 不要提前实现 group / topic / thread
- 不要实现运行时工具审批队列
- 不要为了图省事使用 `process.chdir()`
- 不要让 CLI 直接写配置或 store
- 不要在 Telegram handler 中直接等待 Agent 完整执行

---

## 8. 完成定义

以下条件全部满足时，Phase 1 任务可以判定为完成：

1. 所有 M1-M6 里程碑都达成
2. `T25` 主链路通过人工验证
3. `T30` 中定义的关键测试已具备
4. 没有绕开 `sessionId`、IPC、pairing、`cwd` 这些核心约束的临时实现
