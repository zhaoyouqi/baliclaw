# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BaliClaw is yet another Claw built on Claude Agent SDK. The current product surface supports Telegram, WeChat, and Lark channel adapters, with daemon/runtime structured around adapters plus a shared inbound router. It bridges channel messages with Anthropic's Claude Agent SDK, running as a local daemon (`baliclawd`) with CLI control (`baliclaw`). Node.js 22+, TypeScript, ESM, pnpm only.

## Repository Info

- GitHub repository: `zhaoyouqi/baliclaw`
- HTTPS remote: `https://github.com/zhaoyouqi/baliclaw.git`
- Issues are tracked on GitHub: `https://github.com/zhaoyouqi/baliclaw/issues`
- npm package: `@zhaoyuanjie/baliclaw`
- npm registry: `https://registry.npmjs.org/`

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Compile TypeScript to dist/
pnpm test                 # Run Vitest suite
pnpm test -- <pattern>    # Run focused tests (e.g., pnpm test -- stable-key)
pnpm test:watch           # Vitest watch mode
pnpm dev                  # Run CLI entrypoint via tsx
pnpm dev -- scheduled-tasks list  # Inspect scheduled tasks through the CLI entrypoint
```

Use `nvm use` before running built artifacts directly (`node dist/daemon/index.js`, `node dist/cli/index.js status`, etc.).

## Architecture

### Process Model

Two processes: a long-lived **daemon** holding all state and connections, and a short-lived **CLI** that communicates over a Unix socket (`~/.baliclaw/baliclaw.sock`).

### Message Flow

```
Channel Adapter (Telegram / WeChat / Lark)
  → InboundEnvelope
  → InboundRouter
    → PairingService (per-channel principal check, when supported)
    → SessionService (per-session turn queue)
    → AgentService
      → queryAgent()
        → buildSystemPrompt() with SOUL.md / USER.md / AGENTS.md / MEMORY.md / prompt-only skills
        → Claude Agent SDK with MCP servers / SDK Skills / SubAgents
  → Channel Adapter reply delivery + typing heartbeat
```

### Scheduled Task Flow

```
User asks BaliClaw to create/update a scheduled task
  → agent identifies scheduled task intent
  → baliclaw CLI / IPC scheduled-tasks control plane
  → daemon-native ScheduledTaskManager persists task definitions
  → ScheduledTaskService loads tasks and schedules future runs
  → each run executes as a fresh Claude session
  → result / skip / failure is delivered back through the configured delivery target
```

### Key Modules

- **`src/daemon/bootstrap.ts`** — Service composition and wiring. The central place where all services are created and connected.
- **`src/channel/`** — Channel adapter interfaces, shared router/login control plane, and per-channel adapter implementations under `telegram/`, `wechat/`, and `lark/`.
- **`src/daemon/scheduled-task-service.ts`** — Scheduler lifecycle, next-run timers, non-overlap enforcement, and task run orchestration.
- **`src/daemon/scheduled-task-manager.ts`** — Daemon-native CRUD layer for scheduled task definitions and status lookups.
- **`src/config/`** — Zod-validated JSON5 config (`~/.baliclaw/baliclaw.json5`). All filesystem paths centralized in `paths.ts`.
- **`src/config/scheduled-task-config.ts`** — External scheduled task file schema and load/save service. Scheduled tasks now target a generic `delivery` object instead of Telegram-specific fields.
- **`src/ipc/`** — HTTP-over-Unix-socket control plane. All config/pairing mutations go through daemon IPC, never direct file writes from CLI.
- **`src/ipc/handlers/scheduled-tasks.ts`** — IPC handlers for scheduled task list/create/update/delete/status operations.
- **`src/channel/telegram/`** — Telegram adapter implementation: grammy-based polling, message normalization, reply delivery, typing heartbeat, and Telegram-specific formatting/chunking.
- **`src/channel/wechat/`** — WeChat adapter implementation: iLink QR login lifecycle, polling, message normalization, reply delivery, typing heartbeat, and state persistence.
- **`src/channel/lark/`** — Lark adapter implementation: app-registration login flow, WebSocket event handling, message normalization, and text reply delivery.
- **`src/channel/control.ts`** — Channel login control plane (`channels login`), including WeChat QR start/wait flow and Lark `new|existing` login-state persistence.
- **`src/auth/`** — Pairing workflow: unapproved principals get an 8-char code, operator approves via CLI, principal added to the per-channel allowlist. WeChat login can auto-approve the scanned principal when `userId` is available from login confirmation; Lark `new` login can auto-approve the returned `open_id`.
- **`src/session/`** — Session key derivation and per-session turn queue for serialized processing.
- **`src/runtime/sdk.ts`** — Claude Agent SDK integration. Builds SDK query options, injects prompt context, manages session continuity via `resumeSessionId`, and passes through MCP/Skills/SubAgents.
- **`src/runtime/agent-service.ts`** — Runtime request assembly from daemon options into `queryAgent()`, plus user-facing error handling.
- **`src/runtime/prompts.ts`** — System prompt composition for SOUL.md, USER.md, AGENTS.md, extra prompt files, MEMORY.md, and prompt-only skills.
- **`src/runtime/scheduled-task-status-store.ts`** — Persistent latest-status storage for scheduled tasks.
- **`src/runtime/agents.ts`** — SubAgent definition builder, including `promptFile` loading and MCP server reference resolution.
- **`src/runtime/memory.ts`** — Project memory hash/path helpers and bounded MEMORY.md reads.
- **`src/runtime/tool-policy.ts`** — Allowed tool policy merging for built-ins, MCP wildcards, SDK native `Skill`, and `Agent`.

### State Files (all under `~/.baliclaw/`, local-only)

Config, scheduled task definitions/status, Unix socket, per-channel pairing pending/allowlist JSONs, Claude session mappings, and project memory files under `memory/projects/<project-hash>/MEMORY.md`.

## Conventions

- **pnpm only** — never use npm or bun
- 2-space indent, camelCase vars/functions, PascalCase types, kebab-case filenames
- Module boundaries match spec: channel abstractions and adapter implementations live under `src/channel/`, IPC in `src/ipc/`, runtime/prompt in `src/runtime/` and `src/session/`
- Extend existing service seams rather than cross-module shortcuts
- Never use `process.chdir()` in daemon
- Proxy config stays at the Telegram transport boundary; don't leak proxy env vars to Claude child processes
- Telegram typing is explicit `sendChatAction("typing")`, not SDK-driven
- Config mutations always go through daemon IPC; CLI never writes config/pairing files directly
- Scheduled task mutations also go through daemon IPC / scheduled task manager; do not edit the scheduled task file directly from agent logic
- Scheduled task runs use fresh Claude sessions; they are independent agent executions, not continuations of the current chat session
- Session continuity is channel-aware; Telegram, WeChat, and Lark messages always resolve to different session keys
- Scheduled task schedule times are stored and executed in the daemon machine's local timezone
- BaliClaw is not released yet; do not preserve backward compatibility for superseded local config/state file shapes unless the task explicitly asks for a migration path
- Prompt files are file-system driven: `SOUL.md` and `USER.md` live in the working directory unless overridden; `MEMORY.md` lives under `~/.baliclaw/memory/projects/`
- SDK-native capabilities are passthroughs, not reimplementations: prefer wiring config into SDK options over custom wrappers for MCP, Skills, or SubAgents
- `tools.availableTools` remains the base allowlist; Additions are merged in `runtime/tool-policy.ts`

## Testing

Vitest. Tests in `test/`, named after the unit (e.g., `stable-key.test.ts`). Critical-path coverage includes: config validation, scheduled task schema/status/schedule logic, task manager IPC routes, tool-policy merging, prompt assembly order, memory helpers, subagent definition building, channel-aware pairing flow, stable session keys, turn serialization, Telegram adapter formatting/chunking, and the authorized-inbound-to-agent-reply path.

## Reference Docs

### Phase 1 (Done)

- `docs/phase1/design-spec.md` — Product scope, architecture, boundaries
- `docs/phase1/tech-spec.md` — Implementation details and module layout
- `docs/phase1/task-list.md` — Milestones and executable tasks

### Phase 2 (Done)

- `docs/phase2/phase2-design-spec.md` — Skills, MCP, SubAgents, personalization design
- `docs/phase2/phase2-task-list.md` — Phase 2 milestones and executable tasks

### Reference Templates

- `resources/AGENTS.default.md` — Default workspace operating rules for BaliClaw installs
- `resources/SOUL.default.md` — Default identity and tone template
- `resources/USER.default.md` — Default user-context template
- `resources/TOOLS.default.md` — Default BaliClaw operations manual injected into new workspaces
