import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/runtime/prompts.js";

describe("buildSystemPrompt", () => {
  it("returns the base prompt when no optional files are present", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-base-"));

    try {
      await expect(
        buildSystemPrompt({
          workingDirectory
        })
      ).resolves.toBe("You are the BaliClaw Phase 1 agent.");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("assembles the final prompt in the documented order", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-order-"));
    const extraPromptFile = join(workingDirectory, "extra-prompt.md");

    try {
      await writeFile(join(workingDirectory, "AGENTS.md"), "Repository rules", "utf8");
      await writeFile(extraPromptFile, "Extra runtime instructions", "utf8");

      const prompt = await buildSystemPrompt({
        workingDirectory,
        systemPromptFile: extraPromptFile,
        skillPrompts: [
          {
            name: "foo",
            content: "Skill foo instructions"
          },
          {
            name: "bar",
            content: "Skill bar instructions"
          }
        ]
      });

      expect(prompt).toBe(
        [
          "You are the BaliClaw Phase 1 agent.",
          "=== AGENTS.md ===\nRepository rules",
          "=== SYSTEM PROMPT ===\nExtra runtime instructions",
          "=== SKILL: foo ===\nSkill foo instructions",
          "=== SKILL: bar ===\nSkill bar instructions"
        ].join("\n\n")
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("skips empty optional sections", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-empty-"));
    const extraPromptFile = join(workingDirectory, "extra-prompt.md");

    try {
      await writeFile(join(workingDirectory, "AGENTS.md"), "   \n", "utf8");
      await writeFile(extraPromptFile, "\n", "utf8");

      const prompt = await buildSystemPrompt({
        workingDirectory,
        systemPromptFile: extraPromptFile,
        skillPrompts: [
          {
            name: "empty",
            content: "   "
          }
        ]
      });

      expect(prompt).toBe("You are the BaliClaw Phase 1 agent.");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
