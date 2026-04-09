# BaliClaw 与 Lark 服务器对接说明

## 1. 目标与边界
- 目标：给 `baliclaw` 增加可运行的 `lark` channel，对接飞书/Lark 官方服务端能力。
- 首版范围：仅私聊（`chat_type = p2p`）。
- 接口风格：优先复用 `@larksuiteoapi/node-sdk`，对齐 `openclaw-lark` 的接入方式。

## 2. 对接模式总览

### 2.1 模式 A：关联已有机器人（existing）
- 输入：`appId` + `appSecret`。
- 服务端校验：调用 tenant access token 接口验证凭证可用性。
- 成功后动作：
- 写回 `channels.lark` 配置（含 `enabled=true`）。
- 触发 daemon reload。
- 未拿到用户身份信息时，不自动配对，仍走正常 pairing。

### 2.2 模式 B：新建机器人（new）
- 流程对齐官方安装向导：`init -> begin -> poll`（设备扫码）。
- 用户扫码完成后，从 poll 结果获取：
- `client_id`（作为 appId）
- `client_secret`（作为 appSecret）
- `user_info.open_id`（用于自动配对）
- 成功后动作：
- 写回 `channels.lark` 配置并启用。
- 自动 `approvePrincipal(channel=lark, principalKey=open_id)`。

## 3. 登录阶段服务器交互

### 3.1 新建机器人扫码流程（app registration）
- 基础域名（按环境）：
- Feishu: `https://accounts.feishu.cn`
- Lark: `https://accounts.larksuite.com`
- 接口：`POST /oauth/v1/app/registration`
- `action=init`：探测注册能力。
- `action=begin`：获取 `device_code`、`verification_uri_complete`。
- `action=poll`：轮询结果，直到返回 `client_id/client_secret` 或失败。
- begin 建议参数（与官方工具一致）：
- `archetype=PersonalAgent`
- `auth_method=client_secret`
- `request_user_info=open_id`
- poll 失败码处理：
- `authorization_pending`：继续轮询
- `slow_down`：延长轮询间隔
- `access_denied`：用户拒绝，结束流程
- `expired_token`：二维码过期，提示重试

### 3.2 已有机器人凭证校验
- 接口建议：
- Feishu：`POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`
- Lark：`POST https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal`
- 请求体：
- `app_id`
- `app_secret`
- 通过条件：`code=0` 且返回 `tenant_access_token`。

## 4. 运行时服务器对接（消息收发）

### 4.1 长连接（入站）
- 使用 `@larksuiteoapi/node-sdk` 的 `WSClient + EventDispatcher`。
- 关键步骤：
- 用 `appId/appSecret/domain` 初始化 SDK client。
- 启动前先调用 `POST /open-apis/bot/v1/openclaw_bot/ping` 做探活与 bot 信息预热。
- 注册事件处理器，至少包含：
- `im.message.receive_v1`
- 启动 WSClient 并持续监听；在 stop/reload 时显式关闭连接。

### 4.2 事件过滤与标准化
- 仅处理私聊事件：
- `message.chat_type === "p2p"` 才进入 BaliClaw 主链路。
- 建议字段映射：
- `channel = "lark"`
- `accountId = "default"`
- `chatType = "direct"`
- `conversationId = message.chat_id`
- `senderId = sender.sender_id.open_id`
- `principalKey = sender.sender_id.open_id`
- `text`：优先解析 `message.content` 中的文本字段（如 `{"text":"..."}`）。

### 4.3 出站发送
- 使用 SDK `im.message.create`。
- 关键参数：
- `receive_id_type`：根据目标 ID 推断（`chat_id/open_id/user_id`）。
- `msg_type`：首版可先走 `text`；若要 markdown 体验可改 `post`。
- `content`：JSON 字符串。

## 5. BaliClaw 内部落点（供编码 agent 直接定位）
- 登录控制：`src/channel/control.ts`（新增 lark 分支）+ 新增 `src/lark/login.ts`。
- 运行时适配器：新增 `src/lark/service.ts`、`src/lark/normalize.ts`、`src/lark/send.ts`。
- 配置：`src/config/schema.ts`（新增 `channels.lark`）。
- IPC：`src/ipc/schema.ts`、`src/ipc/client.ts`、`src/ipc/server.ts`（扩展 login 入参与支持 channel）。
- CLI：`src/cli/commands/channels.ts`、`src/cli/index.ts`（新增 lark 登录参数）。
- 启停集成：`src/daemon/bootstrap.ts`、`src/daemon/index.ts`（lark 生命周期 + 启动状态）。

## 6. 可靠性与故障处理要求
- 登录流程统一超时与错误码映射，保证 CLI 可读报错。
- WS 连接在 reload/stop 时必须可回收，避免僵尸连接。
- 凭证写回失败时不得启用 channel；保持原状态并返回错误。
- domain 与凭证必须同一来源（feishu/lark 不混用）。

## 7. 最小验收清单
- `baliclaw channels login --channel lark --mode new` 可完成扫码并启用。
- `baliclaw channels login --channel lark --mode existing --app-id ... --app-secret ...` 可完成校验并启用。
- 私聊消息可跑通：Lark -> BaliClaw -> Agent -> Lark。
- 未配对用户走 pairing；new 模式登录用户可自动通过 pairing。
