# Lark Channel 开发任务（粗颗粒度）

## 目标
- 在 BaliClaw 中新增 `lark` channel。
- 首版仅支持私聊（DM）。
- 登录流程与 `@larksuite/openclaw-lark` 官方流程一致（新建机器人 + 关联已有机器人）。

## 范围约束
- 不做群聊接入与群策略。
- 不做多账号能力，默认 `accountId=default`。
- 不改动 Telegram/WeChat 现有行为。

## 参考文档
- 方案总览：[lark-channel-integration-plan.md](/Users/zhaoyuanjie/workspace/baliclaw/docs/reference/lark-channel-integration-plan.md)
- 服务器对接细节：[lark-server-integration.md](/Users/zhaoyuanjie/workspace/baliclaw/docs/reference/lark-server-integration.md)

## 工作包

### WP1 配置模型扩展
- 任务：扩展 `channels.lark` 配置结构与校验。
- 产出：配置 schema、默认值、启用条件校验。
- 完成标准：`channels.lark.enabled=true` 时凭证校验可用，配置加载/保存无回归。

### WP2 Lark 登录控制面
- 任务：新增 `LarkLoginManager`，支持 `new` 和 `existing` 两种登录模式。
- 产出：登录启动、轮询等待、凭证校验、domain 推断（feishu/lark）。
- 完成标准：两条流程都能返回明确成功/失败状态和可读错误信息。

### WP3 ChannelControl 接入
- 任务：在 `ChannelControlService` 接入 `lark` 登录分支。
- 产出：登录成功后写回配置并启用 channel；拿到 `open_id` 时自动配对。
- 完成标准：登录后无需手动改配置即可触发 daemon 生效。

### WP4 Lark 运行时适配器
- 任务：实现 `LarkService`（`ChannelAdapter`）。
- 产出：WebSocket 收消息、入站标准化、出站文本回复。
- 完成标准：私聊消息可形成 “入站 -> agent -> 回发” 闭环。

### WP5 Daemon 与重载集成
- 任务：将 Lark adapter 挂接到 bootstrap/reload 生命周期。
- 产出：lark 启停、配置变化重建、登录后刷新实例。
- 完成标准：启停与重载路径行为和 wechat/telegram 一致。

### WP6 IPC 与 CLI 扩展
- 任务：扩展 IPC schema/client/server 与 `baliclaw channels login` 参数。
- 产出：`--channel lark --mode new|existing --app-id --app-secret`。
- 完成标准：CLI 可完整驱动两条登录流程，扫码 URL 与状态提示可见。

### WP7 测试补齐
- 任务：补充单测与集成测试覆盖关键路径。
- 产出：登录流程测试、ChannelControl 测试、IPC/CLI 测试、bootstrap 生命周期测试。
- 完成标准：新增功能覆盖关键分支，现有测试无退化。

### WP8 文档与运维说明
- 任务：补充使用文档与故障排查说明。
- 产出：登录命令示例、配置样例、常见错误与处理步骤。
- 完成标准：新同学可按文档完成接入并跑通首条消息。

## 里程碑
- M1：完成 WP1-WP3，具备可保存配置的登录能力。
- M2：完成 WP4-WP6，具备端到端消息闭环能力。
- M3：完成 WP7-WP8，达到可交付状态。

## 交付验收
- 能通过 CLI 完成 `lark` 的新建机器人登录。
- 能通过 CLI 完成 `lark` 的已有机器人关联登录。
- 登录成功后自动启用 channel 并可接收私聊消息。
- 未配对用户仍走 pairing 机制；新建机器人登录用户可自动配对。
- 现有 Telegram/WeChat 功能和测试保持通过。
