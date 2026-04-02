# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BaliClaw is a local-first AI gateway for Telegram DM workflows (Phase 1). It bridges Telegram messaging with Anthropic's Claude Agent SDK, running as a local daemon (`baliclawd`) with CLI control (`baliclaw`). Node.js 22+, TypeScript, ESM, pnpm only.

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
  → AgentService → Claude Agent SDK (queryAgent)
  → TelegramService (reply delivery + typing heartbeat)
```

### Key Modules

- **`src/daemon/bootstrap.ts`** — Service composition and wiring. The central place where all services are created and connected.
- **`src/config/`** — Zod-validated JSON5 config (`~/.baliclaw/baliclaw.json5`). All filesystem paths centralized in `paths.ts`.
- **`src/ipc/`** — HTTP-over-Unix-socket control plane. All config/pairing mutations go through daemon IPC, never direct file writes from CLI.
- **`src/telegram/`** — grammy-based polling, message normalization (`normalize.ts`), reply delivery with typing heartbeat (`send.ts`), Telegram-specific markdown formatting and chunking (`format.ts`).
- **`src/auth/`** — Pairing workflow: unapproved users get an 8-char code, operator approves via CLI, sender added to allowlist.
- **`src/session/`** — Deterministic session ID from Telegram user/chat, per-user turn queue for serialized processing.
- **`src/runtime/`** — Claude Agent SDK integration. `sdk.ts` wraps `query()` with session continuity via `resumeSessionId`. `agent-service.ts` handles message dispatch and error recovery.

### State Files (all under `~/.baliclaw/`, local-only)

Config, Unix socket, pairing pending/allowlist JSONs, and session ID mappings.

## Conventions

- **pnpm only** — never use npm or bun
- 2-space indent, camelCase vars/functions, PascalCase types, kebab-case filenames
- Module boundaries match spec: transport in `src/telegram/`, IPC in `src/ipc/`, runtime/prompt in `src/runtime/` and `src/session/`
- Extend existing service seams rather than cross-module shortcuts
- Never use `process.chdir()` in daemon
- Proxy config stays at the Telegram transport boundary; don't leak proxy env vars to Claude child processes
- Telegram typing is explicit `sendChatAction("typing")`, not SDK-driven
- Config mutations always go through daemon IPC; CLI never writes config/pairing files directly

## Testing

Vitest. Tests in `test/`, named after the unit (e.g., `stable-key.test.ts`). Critical-path coverage includes: config validation, IPC routes, pairing flow, stable session keys, turn serialization, prompt assembly, Telegram formatting/chunking, and the authorized-sender-to-agent-reply path.

## Reference Docs

- `design-spec.md` — Product scope, architecture, boundaries
- `tech-spec.md` — Implementation details and module layout
- `task-list.md` — Milestones and executable tasks
