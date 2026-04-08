import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../src/config/service.js";
import { getAppPaths } from "../src/config/paths.js";
import { AppError, appErrorCodes } from "../src/shared/errors.js";

describe("ConfigService", () => {
  it("returns defaults when the config file is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-defaults-"));

    try {
      const service = new ConfigService(getAppPaths(home));
      const config = await service.load();

      expect(config.channels.telegram).toEqual({
        enabled: false,
        botToken: ""
      });
      expect(config.runtime.workingDirectory).toBe(join(home, ".baliclaw", "workspace"));
      expect(config.tools.availableTools).toEqual(["Bash", "Read", "Write", "Edit"]);
      expect(config.skills).toEqual({
        enabled: true,
        directories: []
      });
      expect(config.runtime.loadFilesystemSettings).toBe(true);
      expect(config.logging).toEqual({
        level: "info"
      });
      expect(config.scheduledTasks).toEqual({
        enabled: true,
        file: join(home, ".baliclaw", "scheduled-tasks.json5")
      });
      await expect(readFile(join(home, ".baliclaw", "workspace", "AGENTS.md"), "utf8")).resolves.toContain("BaliClaw Workspace Rules");
      await expect(readFile(join(home, ".baliclaw", "workspace", "SOUL.md"), "utf8")).resolves.toContain("BaliClaw Default Identity");
      await expect(readFile(join(home, ".baliclaw", "workspace", "USER.md"), "utf8")).resolves.toContain("About The User");
      await expect(readFile(join(home, ".baliclaw", "workspace", "TOOLS.md"), "utf8")).resolves.toContain("BaliClaw Operations Manual");
      await expect(
        readFile(join(home, ".baliclaw", "workspace", ".claude", "skills", "find-skills", "SKILL.md"), "utf8")
      ).resolves.toContain("name: find-skills");
      await expect(
        readFile(join(home, ".baliclaw", "workspace", ".claude", "skills", "skill-creator", "SKILL.md"), "utf8")
      ).resolves.toContain("name: skill-creator");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("loads and normalizes a valid baliclaw.json5 file", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-valid-"));
    const paths = getAppPaths(home);

    try {
      await mkdir(paths.rootDir, { recursive: true });
      await writeFile(
        paths.configFile,
        `{
          channels: {
            telegram: {
              enabled: true,
              botToken: "secret"
            }
          },
          runtime: {
            model: "claude-sonnet",
            maxTurns: 12
          }
        }\n`,
        "utf8"
      );

      const config = await new ConfigService(paths).load();

      expect(config.channels.telegram).toEqual({
        enabled: true,
        botToken: "secret"
      });
      expect(config.runtime.model).toBe("claude-sonnet");
      expect(config.runtime.maxTurns).toBe(12);
      expect(config.runtime.workingDirectory).toBe(join(home, ".baliclaw", "workspace"));
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("does not overwrite pre-existing starter skill directories", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-existing-skill-"));
    const workspaceDirectory = join(home, ".baliclaw", "workspace");
    const existingSkillDirectory = join(workspaceDirectory, ".claude", "skills", "find-skills");
    const existingSkillFile = join(existingSkillDirectory, "SKILL.md");

    try {
      await mkdir(existingSkillDirectory, { recursive: true });
      await writeFile(existingSkillFile, "custom find-skills content\n", "utf8");

      await new ConfigService(getAppPaths(home)).load();

      await expect(readFile(existingSkillFile, "utf8")).resolves.toBe("custom find-skills content\n");
      await expect(
        readFile(join(workspaceDirectory, ".claude", "skills", "skill-creator", "SKILL.md"), "utf8")
      ).resolves.toContain("name: skill-creator");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("skips scaffolding a starter skill when the user already has a same-name global Claude skill", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-global-skill-"));
    const paths = getAppPaths(home);
    const globalFindSkillsDirectory = join(home, ".claude", "skills", "find-skills");
    const workspaceSkillFile = join(
      home,
      ".baliclaw",
      "workspace",
      ".claude",
      "skills",
      "find-skills",
      "SKILL.md"
    );

    try {
      await mkdir(globalFindSkillsDirectory, { recursive: true });
      await writeFile(join(globalFindSkillsDirectory, "SKILL.md"), "global find-skills content\n", "utf8");

      await new ConfigService(paths).load();

      await expect(readFile(join(globalFindSkillsDirectory, "SKILL.md"), "utf8")).resolves.toBe(
        "global find-skills content\n"
      );
      await expect(readFile(workspaceSkillFile, "utf8")).rejects.toMatchObject({
        code: "ENOENT"
      });
      await expect(
        readFile(join(home, ".baliclaw", "workspace", ".claude", "skills", "skill-creator", "SKILL.md"), "utf8")
      ).resolves.toContain("name: skill-creator");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("returns a structured error for unknown top-level fields", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-unknown-"));
    const paths = getAppPaths(home);

    try {
      await mkdir(paths.rootDir, { recursive: true });
      await writeFile(
        paths.configFile,
        `{
          channels: {
            telegram: {
              enabled: false,
              botToken: ""
            }
          },
          extra: true
        }\n`,
        "utf8"
      );

      await expect(new ConfigService(paths).load()).rejects.toMatchObject<AppError>({
        code: appErrorCodes.configInvalid,
        details: {
          issues: [
            expect.objectContaining({
              path: "",
              code: "unrecognized_keys"
            })
          ]
        }
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("rejects enabled telegram config without a bot token", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-token-"));
    const paths = getAppPaths(home);

    try {
      await mkdir(paths.rootDir, { recursive: true });
      await writeFile(
        paths.configFile,
        `{
          channels: {
            telegram: {
              enabled: true
            }
          }
        }\n`,
        "utf8"
      );

      await expect(new ConfigService(paths).load()).rejects.toMatchObject<AppError>({
        code: appErrorCodes.configInvalid,
        details: {
          issues: [
            expect.objectContaining({
              path: "channels.telegram.botToken",
              message: "channels.telegram.botToken is required when channels.telegram.enabled is true"
            })
          ]
        }
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("validates before saving and writes normalized JSON5", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-config-save-"));
    const paths = getAppPaths(home);
    const service = new ConfigService(paths);

    try {
      await service.save({
        channels: {
          telegram: {
            enabled: false,
            botToken: ""
          }
        },
        runtime: {
          workingDirectory: "/tmp/workdir"
        },
        tools: {
          availableTools: ["Bash"]
        },
        skills: {
          enabled: false,
          directories: []
        },
        logging: {
          level: "warn"
        },
        scheduledTasks: {
          enabled: true,
          file: "/tmp/scheduled-tasks.json5"
        }
      });

      await expect(service.load()).resolves.toMatchObject({
        runtime: {
          workingDirectory: "/tmp/workdir"
        },
        tools: {
          availableTools: ["Bash"]
        },
        logging: {
          level: "warn"
        },
        scheduledTasks: {
          enabled: true,
          file: "/tmp/scheduled-tasks.json5"
        }
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
