# Repository Guidelines

## Project Structure & Module Organization

This repository is currently specification-first. The top-level documents define Phase 1:

- `design-spec.md`: product scope, architecture, and boundaries.
- `tech-spec.md`: planned Node.js/TypeScript implementation and module layout.
- `task-list.md`: milestones and executable tasks.

Implementation code should follow the structure defined in `tech-spec.md`: `src/cli/`, `src/daemon/`, `src/ipc/`, `src/config/`, `src/telegram/`, `src/auth/`, `src/session/`, `src/runtime/`, and `src/shared/`. Keep tests in `test/`.

## Build, Test, and Development Commands

Use `pnpm` exclusively for this repository. Do not use `bun install`, `npm install`, or commit lockfiles from other package managers.

- `pnpm install`: install and lock dependencies.
- `pnpm build`: compile TypeScript to `dist/`.
- `pnpm test`: run the Vitest suite.
- `pnpm dev`: run the CLI entrypoint in TypeScript during development.

If you add scripts, keep names stable and document them in `package.json`.

## Coding Style & Naming Conventions

Target stack is Node.js 22+, TypeScript 5.x, ESM modules, and `pnpm`.

- Use 2-space indentation.
- Use `camelCase` for variables and functions.
- Use `PascalCase` for types, interfaces, and classes.
- Use feature-based, kebab-case file names such as `pairing-service.ts` and `stable-key.ts`.

Keep module boundaries aligned with the spec. Centralize filesystem paths in config utilities instead of hardcoding them in runtime code.

## Testing Guidelines

Vitest is the test framework. Name tests after the unit under test, for example `stable-key.test.ts` or `config-service.test.ts`. Prioritize coverage for the Phase 1 path: config loading, IPC behavior, pairing approval, stable session keys, and Telegram routing.

## Commit & Pull Request Guidelines

The current git history uses short, imperative subjects such as `Initial commit` and `Add document files`. Follow the same pattern and keep each commit focused on one logical change when practical.

Pull requests should include a short summary, the relevant spec or task reference, validation steps, and screenshots or CLI transcripts when user-visible behavior changes.

## Security & Configuration Tips

Never commit secrets, bot tokens, or machine-local state. The planned runtime state directory is `~/.baliclaw/`; treat it as local-only and untracked.
