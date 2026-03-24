# BaliClaw

BaliClaw is a local-first AI gateway for Telegram DM workflows.

Phase 1 is focused on a small but working loop:

- a local daemon process
- a CLI that talks to the daemon over a Unix socket
- Telegram DM intake
- pairing / allowlist approval
- Claude Agent SDK execution with stable session IDs
- reply delivery back to Telegram

The original product and technical documents are kept in:

- `design-spec.md`
- `tech-spec.md`
- `task-list.md`

## Status

The current codebase implements the main Phase 1 path:

- daemon bootstrap and shutdown
- config load / save / reload
- Unix socket IPC
- CLI status / config / pairing commands
- Telegram polling and DM normalization
- pairing request creation and approval
- stable per-user session routing
- Claude Agent SDK integration
- prompt-only skills loading

## Requirements

- Node.js 22.x
- pnpm 10.x

This repository uses `.nvmrc`. Before running Node-based commands:

```bash
nvm use
```

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

## CLI Commands

After building, you can use the compiled CLI:

```bash
node dist/cli/index.js status
node dist/cli/index.js config get
node dist/cli/index.js pairing list telegram
node dist/cli/index.js pairing approve telegram <CODE>
```

Current CLI command groups:

- `status`
- `config get`
- `config set`
- `pairing list telegram`
- `pairing approve telegram <CODE>`
- `daemon start`

## Configuration

The daemon reads config from:

```text
~/.baliclaw/baliclaw.json5
```

Phase 1 config shape:

```json5
{
  telegram: {
    enabled: false,
    botToken: ""
  },
  runtime: {
    workingDirectory: "/absolute/path/to/workdir",
    model: "claude-sonnet-4-5",
    maxTurns: 8,
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
  }
}
```

Notes:

- `telegram.botToken` is required when `telegram.enabled` is `true`
- `runtime.workingDirectory` defaults to the daemon process working directory
- config writes go through daemon IPC, not direct CLI file writes
- config updates are hot-reloaded by the daemon

## Pairing Files

Telegram pairing state is stored locally in:

```text
~/.baliclaw/pairing/telegram-pending.json
~/.baliclaw/pairing/telegram-allowlist.json
```

## Development Notes

- Use `pnpm` only.
- Keep filesystem paths centralized in `src/config/paths.ts`.
- Keep transport logic in `src/telegram/` and IPC logic in `src/ipc/`.
- Keep runtime and prompt behavior in `src/runtime/` and `src/session/`.

## License

MIT. See `LICENSE`.
