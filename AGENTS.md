# Repository Guidelines

## Project Structure & Module Organization

This repository is now a partially implemented Phase 1 codebase with the original specs kept at the top level:

- `design-spec.md`: product scope, architecture, and boundaries.
- `tech-spec.md`: planned Node.js/TypeScript implementation and module layout.
- `task-list.md`: milestones and executable tasks.

Implementation code should follow the structure defined in `tech-spec.md`: `src/cli/`, `src/daemon/`, `src/ipc/`, `src/config/`, `src/telegram/`, `src/auth/`, `src/session/`, `src/runtime/`, and `src/shared/`. Keep tests in `test/`.

Current Phase 1 implementation is centered around:

- `src/daemon/bootstrap.ts`: daemon wiring, service composition, and runtime message path.
- `src/daemon/reload-service.ts`: config file watching and hot reload application.
- `src/ipc/server.ts` and `src/ipc/client.ts`: local Unix socket control plane.
- `src/telegram/service.ts`: Telegram polling, normalization, pairing gate, and async enqueue.
- `src/runtime/agent-service.ts` and `src/runtime/sdk.ts`: Claude Agent SDK integration.

## Build, Test, and Development Commands

Use `pnpm` exclusively for this repository. Do not use `bun install`, `npm install`, or commit lockfiles from other package managers.

Before running any `node`, `pnpm`, `tsc`, `tsx`, or other Node.js-based command, run `nvm use` in the repository root so the shell uses the version declared in `.nvmrc`.

- `pnpm install`: install and lock dependencies.
- `pnpm build`: compile TypeScript to `dist/`.
- `pnpm test`: run the Vitest suite.
- `pnpm test -- <pattern>`: run a focused subset of tests during iteration.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm dev`: run the CLI entrypoint in TypeScript during development.

If you add scripts, keep names stable and document them in `package.json`.

Useful manual run commands:

- `node dist/daemon/index.js`: start the daemon directly after `pnpm build`.
- `node dist/cli/index.js status`: query daemon status over IPC.
- `node dist/cli/index.js config get`: read current config over IPC.
- `node dist/cli/index.js pairing list telegram`: list pending Telegram pairing requests.
- `node dist/cli/index.js pairing approve telegram <CODE>`: approve a pending Telegram pairing code.

## Coding Style & Naming Conventions

Target stack is Node.js 22+, TypeScript 5.x, ESM modules, and `pnpm`.

- Use 2-space indentation.
- Use `camelCase` for variables and functions.
- Use `PascalCase` for types, interfaces, and classes.
- Use feature-based, kebab-case file names such as `pairing-service.ts` and `stable-key.ts`.

Keep module boundaries aligned with the spec. Centralize filesystem paths in config utilities instead of hardcoding them in runtime code.

When changing daemon behavior, prefer extending existing service seams instead of introducing cross-module shortcuts. In particular:

- keep filesystem path knowledge in `src/config/paths.ts`
- keep IPC request parsing/response shaping in `src/ipc/`
- keep Telegram transport concerns in `src/telegram/`
- keep Claude runtime prompt/tool/session behavior in `src/runtime/` and `src/session/`

## Testing Guidelines

Vitest is the test framework. Name tests after the unit under test, for example `stable-key.test.ts` or `config-service.test.ts`. Prioritize coverage for the Phase 1 path: config loading, IPC behavior, pairing approval, stable session keys, and Telegram routing.

Phase 1 critical-path regressions should continue covering:

- config validation and atomic persistence
- IPC status/config/pairing routes
- pairing persistence and approval flow
- stable `sessionId` generation and keyed turn serialization
- prompt assembly and prompt-only skill loading
- Telegram handler returning immediately after queueing work
- unauthorized senders not reaching the runtime
- authorized senders reaching the agent and getting a reply
- `cwd` propagation without cross-session leakage under concurrency

## Commit & Pull Request Guidelines

The current git history uses short, imperative subjects such as `Initial commit` and `Add document files`. Follow the same pattern and keep each commit focused on one logical change when practical.

Pull requests should include a short summary, the relevant spec or task reference, validation steps, and screenshots or CLI transcripts when user-visible behavior changes.

## Security & Configuration Tips

Never commit secrets, bot tokens, or machine-local state. The planned runtime state directory is `~/.baliclaw/`; treat it as local-only and untracked.

Current local state and control files include:

- `~/.baliclaw/baliclaw.json5`
- `~/.baliclaw/baliclaw.sock`
- `~/.baliclaw/pairing/telegram-pending.json`
- `~/.baliclaw/pairing/telegram-allowlist.json`

Additional runtime notes:

- all config mutations should continue to go through daemon IPC; CLI must not write config or pairing files directly
- `POST /v1/config/set` already triggers in-memory reload, so avoid adding extra manual refresh steps around it
- config file watching is enabled in the daemon; updates to logging, runtime prompt/tool config, and Telegram token/enabled state are expected to hot-apply
