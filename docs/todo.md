# TODO

This document tracks the next product and implementation gaps to close after the initial `v0.1` release preparation.

## 1. Onboarding Should Help Configure Claude Settings

Current gap:

- BaliClaw depends on valid Claude settings, but first-time users still need to prepare `~/.claude/settings.json` on their own.

What to add:

- Extend the onboarding flow to detect missing or incomplete Claude settings.
- Guide the user through configuring provider-related values such as auth token, base URL, and model defaults when needed.
- Validate the resulting Claude settings before declaring onboarding complete.

Desired outcome:

- A new user can get BaliClaw running without manually reverse-engineering the Claude settings format.

## 2. Telegram Slash Command For New Sessions

Current gap:

- Session continuity works, but users cannot explicitly start a fresh session from Telegram.

What to add:

- Support a Telegram slash command that creates a new session for the current user or chat.
- Reset the BaliClaw-to-Claude session mapping for that conversation when the command is used.
- Reply with a clear confirmation that subsequent messages will use a fresh session.

Desired outcome:

- Users can intentionally discard stale context and start over without touching local files.

## 3. Prebuilt Skills For Fast Extension

Current gap:

- BaliClaw supports prompt-only skills and SDK filesystem settings, but a fresh install does not provide useful starter skills.

What to add:

- Ship a small starter set of skills.
- Include at least:
  - a search-oriented skill
  - a `skill-creator` skill
- Make these available in a way that lets users discover and extend skills quickly.

Desired outcome:

- Users can expand BaliClaw behavior immediately instead of first building the tooling needed to build skills.

## 4. Add A TUI For Local Debugging And Temporary Use

Current gap:

- BaliClaw currently depends on configured channels such as Telegram for normal interaction.
- This makes local debugging slower and leaves no lightweight fallback when channels are not configured on a remote node yet.

What to add:

- Build a terminal UI for local interactive use.
- Let operators send prompts and inspect replies without going through Telegram.
- Make it usable as a temporary interaction surface on remote machines before channel configuration is complete.

Desired outcome:

- Developers can debug BaliClaw locally with a fast feedback loop.
- Remote nodes can still be used interactively even before Telegram or other channels are configured.
