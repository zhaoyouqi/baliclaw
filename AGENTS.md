# Repository Guidelines

## Project Structure & Module Organization

This repository is currently specification-first. The top-level documents define the Phase 1 product and implementation plan:

- `design-spec.md`: product scope, architecture boundaries, and data model.
- `tech-spec.md`: planned Node.js/TypeScript stack, module layout, and runtime rules.
- `task-list.md`: milestone and task breakdown for implementation.

When code is added, follow the structure proposed in `tech-spec.md`: `src/cli/`, `src/daemon/`, `src/ipc/`, `src/config/`, `src/telegram/`, `src/auth/`, `src/session/`, `src/runtime/`, `src/shared/`, with tests under `test/`.

## Build, Test, and Development Commands

The implementation has not been scaffolded yet, so there is no live build pipeline in this repository today. Once the Node.js project is created, use the commands defined in `tech-spec.md`:

- `pnpm install`: install dependencies.
- `pnpm build`: compile the TypeScript project.
- `pnpm test`: run the Vitest suite.
- `pnpm dev`: run the local development entrypoint if added.

Keep command names stable and document any new scripts in `package.json`.

## Coding Style & Naming Conventions

Target stack is Node.js 22+, TypeScript 5.x, ESM modules, and `pnpm`. Prefer:

- 2-space indentation.
- `camelCase` for variables and functions.
- `PascalCase` for types, interfaces, and classes.
- kebab-case or feature-based file names such as `pairing-service.ts` and `stable-key.ts`.

Use explicit module boundaries that match the spec. Avoid hardcoding runtime paths; centralize them in config/path utilities.

## Testing Guidelines

Vitest is the planned test framework. Place tests under `test/` or adjacent to modules if the layout later requires it. Name tests after the unit under test, for example `stable-key.test.ts` or `pairing-service.test.ts`. Cover the Phase 1 critical path first: config loading, IPC, pairing approval, session key generation, and Telegram message routing.

## Commit & Pull Request Guidelines

Current git history uses short, imperative commit subjects such as `Initial commit` and `Add document files`. Follow that pattern:

- Keep the subject concise and action-oriented.
- One logical change per commit when practical.

Pull requests should include a clear summary, affected spec/tasks, validation steps, and screenshots or CLI transcripts when behavior changes are user-visible.

## Security & Configuration Tips

Do not commit secrets, bot tokens, or local state. The planned runtime stores state under `~/.baliclaw/`; treat that directory as machine-local and untracked.
