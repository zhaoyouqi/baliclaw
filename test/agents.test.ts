import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/shared/errors.js";
import { buildAgentDefinitions } from "../src/runtime/agents.js";

describe("buildAgentDefinitions", () => {
  it("passes inline prompt definitions through to SDK agent definitions", async () => {
    await expect(
      buildAgentDefinitions({
        workingDirectory: "/tmp/project",
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code."
          }
        }
      })
    ).resolves.toEqual({
      reviewer: {
        description: "Review code",
        prompt: "You review code."
      }
    });
  });

  it("loads promptFile content into the prompt field", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-agents-prompt-file-"));
    const promptFile = join(workingDirectory, "reviewer.md");

    try {
      await writeFile(promptFile, "Prompt from file", "utf8");

      await expect(
        buildAgentDefinitions({
          workingDirectory,
          agents: {
            reviewer: {
              description: "Review code",
              promptFile
            }
          }
        })
      ).resolves.toEqual({
        reviewer: {
          description: "Review code",
          prompt: "Prompt from file"
        }
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("resolves relative promptFile paths against the working directory", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "baliclaw-agents-relative-file-"));

    try {
      await writeFile(join(workingDirectory, "reviewer.md"), "Relative prompt", "utf8");

      await expect(
        buildAgentDefinitions({
          workingDirectory,
          agents: {
            reviewer: {
              description: "Review code",
              promptFile: "reviewer.md"
            }
          }
        })
      ).resolves.toEqual({
        reviewer: {
          description: "Review code",
          prompt: "Relative prompt"
        }
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("throws a structured error when promptFile does not exist", async () => {
    await expect(
      buildAgentDefinitions({
        workingDirectory: "/tmp/project",
        agents: {
          reviewer: {
            description: "Review code",
            promptFile: "missing.md"
          }
        }
      })
    ).rejects.toMatchObject<AppError>({
      name: "AppError",
      details: {
        agent: "reviewer",
        promptFile: "/tmp/project/missing.md"
      }
    });
  });

  it("resolves agent MCP server references into SDK server specs", async () => {
    await expect(
      buildAgentDefinitions({
        workingDirectory: "/tmp/project",
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code.",
            mcpServers: ["github"]
          }
        },
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"]
          }
        }
      })
    ).resolves.toEqual({
      reviewer: {
        description: "Review code",
        prompt: "You review code.",
        mcpServers: [
          {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"]
            }
          }
        ]
      }
    });
  });

  it("throws when an agent references an unknown MCP server", async () => {
    await expect(
      buildAgentDefinitions({
        workingDirectory: "/tmp/project",
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code.",
            mcpServers: ["github"]
          }
        },
        mcpServers: {}
      })
    ).rejects.toMatchObject<AppError>({
      name: "AppError",
      details: {
        agent: "reviewer",
        mcpServer: "github"
      }
    });
  });
});
