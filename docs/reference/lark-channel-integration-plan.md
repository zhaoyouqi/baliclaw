# BaliClaw Lark Channel 接入计划（对齐 `@larksuite/openclaw-lark`）

## Summary
- 在 `baliclaw` 新增 `lark` channel，首版仅支持私聊（DM）。
- `channels login --channel lark` 完整支持两条路径并与官方一致：
- 新建机器人：扫码创建并返回凭证，自动写回配置，自动配对登录用户。
- 关联已有机器人：通过 `appId/appSecret` 校验后接入并写回配置。
- 实现基于官方流程的登录控制面与运行时适配器，保持现有 Telegram/WeChat 行为不变。

## Implementation Changes

### 1) 配置与公共接口
- 扩展 `AppConfig.channels` 新增 `lark`：
- `enabled`、`appId`、`appSecret`、`domain`（`feishu|lark`，默认 `feishu`）、`connectionMode`（默认 `websocket`）。
- 扩展 IPC 登录入参/出参类型：
- `channelLoginStartRequest` 对 `lark` 增加 `mode`（`new|existing`）、`appId`、`appSecret`。
- 保持 `qrDataUrl/sessionKey/message` 通用返回；`lark` 的扫码 URL 复用 `qrDataUrl` 字段。

### 2) 登录控制面（ChannelControl + LoginManager）
- 新增 `LarkLoginManager`（结构对齐官方安装流程）：
- `existing` 模式：调用 tenant access token 接口验证 `appId/appSecret`。
- `new` 模式：走 app registration `init/begin/poll`，返回扫码 URL，处理 `authorization_pending/slow_down/access_denied/expired_token`，成功后拿到 `client_id/client_secret` 与 `user_info.open_id`。
- 根据 `tenant_brand` 自动切换 `domain`（`feishu`/`lark`）。
- `ChannelControlService` 新增 `lark` 分支：
- 登录成功后写回 `channels.lark` 凭证并 `enabled=true`。
- 若拿到 `user_info.open_id`，自动执行 `pairingService.approvePrincipal({ channel: "lark", ... })`。
- 触发 daemon reload / credentials refresh。

### 3) Lark 运行时适配器
- 新增 `LarkService implements ChannelAdapter`：
- 启动 WebSocket 监听（`im.message.receive_v1`）。
- 入站仅接收 `p2p`，群消息直接忽略（满足“仅私聊”）。
- 标准化为 `InboundEnvelope`：
- `channel="lark"`，`accountId="default"`，`chatType="direct"`。
- `principalKey=sender_open_id`，`conversationId` 使用 `chat_id`，`senderId` 使用 `open_id`。
- 出站 `sendText` 使用 Lark IM create message（文本/markdown 按现有 BaliClaw 输出策略）。
- 在 `bootstrap/reload` 中接入 `LarkService` 生命周期与配置变更重建逻辑。
- daemon `supportedPairingChannels`、`supportedLoginChannels` 加入 `lark`，启动日志增加 `larkEnabled`。

### 4) CLI
- `baliclaw channels login` 增加 Lark 参数：
- `--channel lark --mode new|existing --app-id <id> --app-secret <secret> [--timeoutMs ...]`
- 输出文案改为通用扫码提示（不写死 WeChat），有 `qrDataUrl` 时统一展示。

## Public API / Type Changes
- `src/config/schema.ts`: `channels.lark` 新类型与校验规则。
- `src/ipc/schema.ts`:
- `channelLoginStartRequestSchema` 由简单结构扩展为按 channel 区分的可判别结构（至少覆盖 wechat/lark）。
- `src/ipc/client.ts` 与 `src/cli/commands/channels.ts`:
- `startChannelLogin` 增加 Lark 可选参数透传。
- `src/channel/control.ts`:
- `startLogin/waitForLogin` 新增 `lark` 分支输入输出契约。

## Test Plan
- `LarkLoginManager` 单测：
- `new` 流程：扫码 URL、pending、slow_down、expired、access_denied、成功落地。
- `existing` 流程：凭证有效/无效分支。
- `tenant_brand=lark` 的 domain 切换。
- `ChannelControlService` 单测：
- `lark new` 登录成功后：配置写回 + `enabled=true` + 自动配对调用。
- `lark existing` 成功后：配置写回；无 open_id 时不自动配对。
- IPC/CLI 单测：
- 新请求结构校验、参数透传、输出文案（含 `qrDataUrl`）。
- daemon/bootstrap 单测：
- lark 启停、重载、supported channel 列表更新。
- 配置 schema 单测：
- `channels.lark.enabled=true` 时凭证必填。

## Assumptions
- 首版范围固定为 Lark 私聊，不做群聊行为与群策略。
- `existing` 模式只做凭证校验与接入；自动配对仅在 `new` 模式拿到 `open_id` 时执行。
- 以 `@larksuite/openclaw-lark` 的官方安装行为为语义基准，不再依赖旧的 `openclaw-lark-tools` 命令入口约定。
