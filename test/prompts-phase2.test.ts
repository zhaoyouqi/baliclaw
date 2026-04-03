import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/runtime/prompts.js";

describe("buildSystemPrompt Phase 2", () => {
  it("orders SOUL, USER, AGENTS, memory, and skills as documented", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-phase2-order-"));

    try {
      await writeFile(join(workingDirectory, "SOUL.md"), "Soul", "utf8");
      await writeFile(join(workingDirectory, "USER.md"), "User", "utf8");
      await writeFile(join(workingDirectory, "AGENTS.md"), "Agents", "utf8");

      const prompt = await buildSystemPrompt({
        workingDirectory,
        memoryEnabled: true,
        memoryFilePath: "/tmp/memory/MEMORY.md",
        memoryContent: "Memory",
        skillPrompts: [
          {
            name: "phase2",
            content: "Skill content"
          }
        ]
      });

      expect(prompt.indexOf("=== SOUL.md ===")).toBeLessThan(prompt.indexOf("=== USER.md ==="));
      expect(prompt.indexOf("=== USER.md ===")).toBeLessThan(prompt.indexOf("=== AGENTS.md ==="));
      expect(prompt.indexOf("=== AGENTS.md ===")).toBeLessThan(prompt.indexOf("=== PERSISTENT MEMORY ==="));
      expect(prompt.indexOf("=== PERSISTENT MEMORY ===")).toBeLessThan(prompt.indexOf("=== SKILL: phase2 ==="));
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("silently skips missing SOUL and USER files", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-phase2-missing-"));

    try {
      await writeFile(join(workingDirectory, "AGENTS.md"), "Agents", "utf8");

      const prompt = await buildSystemPrompt({
        workingDirectory
      });

      expect(prompt).not.toContain("=== SOUL.md ===");
      expect(prompt).not.toContain("=== USER.md ===");
      expect(prompt).toContain("=== AGENTS.md ===\nAgents");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("omits the memory section when memory is disabled", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-phase2-memory-disabled-"));

    try {
      const prompt = await buildSystemPrompt({
        workingDirectory,
        memoryEnabled: false,
        memoryFilePath: "/tmp/memory/MEMORY.md",
        memoryContent: "Memory"
      });

      expect(prompt).not.toContain("=== PERSISTENT MEMORY ===");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("falls back to the Phase 1 prompt when all Phase 2 files are missing and memory is disabled", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-prompts-phase2-fallback-"));

    try {
      await expect(
        buildSystemPrompt({
          workingDirectory,
          memoryEnabled: false
        })
      ).resolves.toBe("You are the BaliClaw Phase 1 agent.");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
