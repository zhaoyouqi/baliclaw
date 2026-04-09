# BaliClaw

BaliClaw is yet another Claw built on Claude Agent SDK. Telegram, WeChat, and Lark are supported channel adapters, and the daemon/runtime path is channel-agnostic with adapters plus a shared inbound router.

## Quick Start

Install:

```bash
npm install -g @zhaoyuanjie/baliclaw
```

Before starting BaliClaw, make sure your Claude settings are already configured on this machine. In practice this means:

- `~/.claude/settings.json` is configured for your provider
- the required auth token and base URL settings are present when your provider needs them
- the Claude runtime used by the Agent SDK can authenticate successfully with those settings

If those Claude settings are not valid, BaliClaw will not be able to process inbound channel messages.

If you run BaliClaw as `root`, Claude Code cannot use `bypassPermissions`. In that setup BaliClaw falls back to `dontAsk`, and shell access such as `Bash` also needs to be statically allowed in `~/.claude/settings.json`, for example:

```json
{
  "permissions": {
    "allow": ["Bash(*)"]
  }
}
```

Without that extra allow rule, Claude may reject Bash tool calls even when `tools.availableTools` includes `Bash`.

Start the daemon:

```bash
baliclawd
```

Check status:

```bash
baliclaw status
```

Set your Telegram bot token:

```bash
baliclaw config set --path channels.telegram.botToken '<TOKEN>'
baliclaw config set --path channels.telegram.enabled true
```

On first run, BaliClaw creates local state under `~/.baliclaw/`, including a default workspace at `~/.baliclaw/workspace` with `AGENTS.md`, `SOUL.md`, `USER.md`, and `TOOLS.md`.

Current core capabilities:

- a local daemon process
- a CLI that talks to the daemon over a Unix socket
- channel adapter intake for Telegram, WeChat, and Lark
- channel-aware pairing / allowlist approval
- Claude Agent SDK execution with stable session IDs
- reply delivery back through the active adapter

The original product and technical documents are kept in:

- `design-spec.md`
- `tech-spec.md`
- `task-list.md`

## Status

The current codebase implements:

- daemon bootstrap and shutdown
- config load / save / reload
- Unix socket IPC
- CLI status / config / pairing commands
- channel adapter bootstrap and shared inbound routing
- Telegram polling and DM normalization
- WeChat iLink login, polling, and direct-message normalization
- Lark app-registration / existing-app login and direct-message normalization
- pairing request creation and approval
- stable per-user session routing
- Claude Agent SDK integration
- prompt-only skills loading
- daemon-native scheduled task support
- scheduled task CLI / IPC management

## Requirements

- Node.js 22.x
- pnpm 10.x

This repository uses `.nvmrc`. Before running Node-based commands:

```bash
nvm use
```

In practice, this matters when you are manually debugging or running BaliClaw itself with local `node` / `pnpm` commands. It is not meant as a blanket requirement for every shell command in the workspace.

## Install

```bash
nvm use
pnpm install
```

## Build And Test

```bash
nvm use
pnpm build
pnpm test
```

For focused test runs:

```bash
nvm use
pnpm test -- daemon-lifecycle
```

## Running The Daemon

Build first:

```bash
nvm use
pnpm build
```

Then start the daemon:

```bash
node dist/daemon/index.js
```

Or use the installed binary path after build:

```bash
./dist/daemon/index.js
```

The daemon keeps local state under `~/.baliclaw/` and listens on:

```text
~/.baliclaw/baliclaw.sock
```

Stop it with `Ctrl+C` or `SIGTERM`.

If your local network needs a proxy for Telegram, start the daemon with proxy env vars set for the daemon process. BaliClaw will use that for Telegram transport, but Claude child processes are intentionally started without inheriting those proxy vars.

## CLI Commands

After building, you can use the compiled CLI:

```bash
node dist/cli/index.js status
node dist/cli/index.js config get
node dist/cli/index.js config set --path channels.telegram.botToken '<TOKEN>'
node dist/cli/index.js channels login --channel wechat --verbose
node dist/cli/index.js channels login --channel lark --mode new --domain lark
node dist/cli/index.js pairing list telegram
node dist/cli/index.js pairing approve telegram <CODE>
node dist/cli/index.js tui
```

Current CLI command groups:

- `status`
- `config get`
- `config set`
- `config set --path <config.path> <value>`
- `pairing list telegram`
- `pairing approve telegram <CODE>`
- `pairing list wechat`
- `pairing approve wechat <CODE>`
- `pairing list lark`
- `pairing approve lark <CODE>`
- `channels login --channel wechat [--verbose] [--timeoutMs <ms>]`
- `channels login --channel lark --mode new|existing [--domain feishu|lark] [--app-id <id>] [--app-secret <secret>] [--verbose] [--timeoutMs <ms>]`
- `scheduled-tasks list`
- `scheduled-tasks status <taskId>`
- `scheduled-tasks create <taskId> '<task-json5>'`
- `scheduled-tasks update <taskId> '<task-json5>'`
- `scheduled-tasks delete <taskId>`
- `daemon start`
- `tui`

## Configuration

The daemon reads config from:

```text
~/.baliclaw/baliclaw.json5
```

Current config shape:

```json5
{
  channels: {
    telegram: {
      enabled: false,
      botToken: ""
    },
    wechat: {
      enabled: false,
      apiBaseUrl: "https://ilinkai.weixin.qq.com",
      botType: "3"
    },
    lark: {
      enabled: false,
      appId: "",
      appSecret: "",
      domain: "feishu",
      connectionMode: "websocket"
    }
  },
  runtime: {
    workingDirectory: "/absolute/path/to/workdir",
    model: "claude-sonnet-4-5",
    maxTurns: 16,
    systemPromptFile: "/absolute/path/to/system-prompt.md"
  },
  tools: {
    availableTools: ["Bash", "Read", "Write", "Edit"]
  },
  skills: {
    enabled: true,
    directories: []
  },
  logging: {
    level: "info"
  },
  scheduledTasks: {
    enabled: true,
    file: "~/.baliclaw/scheduled-tasks.json5"
  }
}
```

Notes:

- `channels.telegram.botToken` is required when `channels.telegram.enabled` is `true`
- `channels.wechat` uses daemon-managed state for login credentials; do not put WeChat bot token in config
- `channels.lark.appId` and `channels.lark.appSecret` are required when `channels.lark.enabled` is `true`
- `baliclaw channels login --channel wechat` persists login state and auto-enables `channels.wechat.enabled` on success
- `baliclaw channels login --channel lark --mode new|existing` persists credentials and auto-enables `channels.lark.enabled` on success
- when WeChat login returns a `userId`, that scanned principal is auto-approved for `wechat/default`; other WeChat users still require pairing approval
- when Lark `new` login returns an `open_id`, that scanned principal is auto-approved for `lark/default`; other Lark users still require pairing approval
- `runtime.workingDirectory` defaults to the daemon process working directory
- config writes go through daemon IPC, not direct CLI file writes
- config updates are hot-reloaded by the daemon
- scheduled tasks are enabled by default, but no tasks run until tasks are created
- the project is not released yet, so old local config/state file formats are not treated as compatibility targets

## Pairing Files

Telegram pairing state is stored locally in:

```text
~/.baliclaw/pairing/telegram/default-pending.json
~/.baliclaw/pairing/telegram/default-allowlist.json
```

WeChat pairing state is stored locally in:

```text
~/.baliclaw/pairing/wechat/default-pending.json
~/.baliclaw/pairing/wechat/default-allowlist.json
```

Lark pairing state is stored locally in:

```text
~/.baliclaw/pairing/lark/default-pending.json
~/.baliclaw/pairing/lark/default-allowlist.json
```

Claude session continuity is stored in:

```text
~/.baliclaw/sessions/claude-sessions.json
```

## Scheduled Task Shape

Scheduled tasks now target a generic delivery object instead of Telegram-specific fields:

```json5
{
  schedule: {
    kind: "daily",
    time: "09:00"
  },
  prompt: "Summarize",
  delivery: {
    channel: "telegram",
    accountId: "default",
    chatType: "direct",
    conversationId: "123456789"
  },
  timeoutMinutes: 30
}
```

## Session Isolation

Session continuity is isolated by `channel + accountId + chat type + principal/conversation` (for direct chats, `senderId` is used). This means Telegram, WeChat, and Lark conversations always run in separate sessions even for the same human user.

## Development Notes

- Use `pnpm` only.
- Keep filesystem paths centralized in `src/config/paths.ts`.
- Keep shared channel routing and adapter-specific logic in `src/channel/`, with per-channel implementations under `src/channel/telegram/`, `src/channel/wechat/`, and `src/channel/lark/`.
- Keep runtime and prompt behavior in `src/runtime/` and `src/session/`.

## License

MIT. See `LICENSE`.
