# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BaliClaw is a local-first AI gateway for Telegram DM workflows. It bridges Telegram messaging with Anthropic's Claude Agent SDK, running as a local daemon (`baliclawd`) with CLI control (`baliclaw`). Phase 2 extends the Phase 1 transport with MCP server passthrough, SDK native Skills, SubAgents, and file-backed personalization (`SOUL.md`, `USER.md`, `MEMORY.md`). Node.js 22+, TypeScript, ESM, pnpm only.

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Compile TypeScript to dist/
pnpm test                 # Run Vitest suite
pnpm test -- <pattern>    # Run focused tests (e.g., pnpm test -- stable-key)
pnpm test:watch           # Vitest watch mode
pnpm dev                  # Run CLI entrypoint via tsx
```

Use `nvm use` before running built artifacts directly (`node dist/daemon/index.js`, `node dist/cli/index.js status`, etc.).

## Architecture

### Process Model

Two processes: a long-lived **daemon** holding all state and connections, and a short-lived **CLI** that communicates over a Unix socket (`~/.baliclaw/baliclaw.sock`).

### Message Flow

```
Telegram Update → TelegramService (polling)
  → PairingService (allowlist check)
  → SessionService (per-user turn queue)
  → AgentService
    → queryAgent()
      → buildSystemPrompt() with SOUL.md / USER.md / AGENTS.md / MEMORY.md / prompt-only skills
      → Claude Agent SDK with MCP servers / SDK Skills / SubAgents
  → TelegramService (reply delivery + typing heartbeat)
```

### Key Modules

- **`src/daemon/bootstrap.ts`** — Service composition and wiring. The central place where all services are created and connected.
- **`src/config/`** — Zod-validated JSON5 config (`~/.baliclaw/baliclaw.json5`). Phase 2 config covers MCP servers, SubAgents, memory, and runtime prompt files. All filesystem paths centralized in `paths.ts`.
- **`src/ipc/`** — HTTP-over-Unix-socket control plane. All config/pairing mutations go through daemon IPC, never direct file writes from CLI.
- **`src/telegram/`** — grammy-based polling, message normalization (`normalize.ts`), reply delivery with typing heartbeat (`send.ts`), Telegram-specific markdown formatting and chunking (`format.ts`).
- **`src/auth/`** — Pairing workflow: unapproved users get an 8-char code, operator approves via CLI, sender added to allowlist.
- **`src/session/`** — Deterministic session ID from Telegram user/chat, per-user turn queue for serialized processing.
- **`src/runtime/sdk.ts`** — Claude Agent SDK integration. Builds SDK query options, injects prompt context, manages session continuity via `resumeSessionId`, and passes through MCP/Skills/SubAgents.
- **`src/runtime/agent-service.ts`** — Runtime request assembly from daemon options into `queryAgent()`, plus user-facing error handling.
- **`src/runtime/prompts.ts`** — System prompt composition for SOUL.md, USER.md, AGENTS.md, extra prompt files, MEMORY.md, and prompt-only skills.
- **`src/runtime/agents.ts`** — SubAgent definition builder, including `promptFile` loading and MCP server reference resolution.
- **`src/runtime/memory.ts`** — Project memory hash/path helpers and bounded MEMORY.md reads.
- **`src/runtime/tool-policy.ts`** — Allowed tool policy merging for built-ins, MCP wildcards, SDK native `Skill`, and `Agent`.

### State Files (all under `~/.baliclaw/`, local-only)

Config, Unix socket, pairing pending/allowlist JSONs, Claude session mappings, and project memory files under `memory/projects/<project-hash>/MEMORY.md`.

## Conventions

- **pnpm only** — never use npm or bun
- 2-space indent, camelCase vars/functions, PascalCase types, kebab-case filenames
- Module boundaries match spec: transport in `src/telegram/`, IPC in `src/ipc/`, runtime/prompt in `src/runtime/` and `src/session/`
- Extend existing service seams rather than cross-module shortcuts
- Never use `process.chdir()` in daemon
- Proxy config stays at the Telegram transport boundary; don't leak proxy env vars to Claude child processes
- Telegram typing is explicit `sendChatAction("typing")`, not SDK-driven
- Config mutations always go through daemon IPC; CLI never writes config/pairing files directly
- Phase 2 prompt files are file-system driven: `SOUL.md` and `USER.md` live in the working directory unless overridden; `MEMORY.md` lives under `~/.baliclaw/memory/projects/`
- SDK-native capabilities are passthroughs, not reimplementations: prefer wiring config into SDK options over custom wrappers for MCP, Skills, or SubAgents
- `tools.availableTools` remains the base allowlist; Phase 2 additions are merged in `runtime/tool-policy.ts`

## Testing

Vitest. Tests in `test/`, named after the unit (e.g., `stable-key.test.ts`). Critical-path coverage includes: config validation, Phase 2 tool-policy merging, prompt assembly order, memory helpers, subagent definition building, IPC routes, pairing flow, stable session keys, turn serialization, Telegram formatting/chunking, and the authorized-sender-to-agent-reply path.

## Reference Docs

### Phase 1

- `docs/phase1/design-spec.md` — Product scope, architecture, boundaries
- `docs/phase1/tech-spec.md` — Implementation details and module layout
- `docs/phase1/task-list.md` — Milestones and executable tasks

### Phase 2

- `docs/phase2/phase2-design-spec.md` — Skills, MCP, SubAgents, personalization design
- `docs/phase2/phase2-task-list.md` — Phase 2 milestones and executable tasks

### Reference Templates

- `docs/reference/AGENTS.default.md` — Default workspace operating rules for BaliClaw installs
- `docs/reference/SOUL.default.md` — Default identity and tone template
- `docs/reference/USER.default.md` — Default user-context template
