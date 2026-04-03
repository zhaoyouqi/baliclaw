import { describe, expect, it } from "vitest";
import { appConfigSchema } from "../src/config/schema.js";

describe("appConfigSchema Phase 2", () => {
  it("parses stdio, http, and sse MCP server configs", () => {
    const config = appConfigSchema.parse({
      mcp: {
        servers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "secret"
            }
          },
          docs: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token"
            }
          },
          events: {
            type: "sse",
            url: "https://example.com/sse"
          }
        }
      }
    });

    expect(config.mcp.servers.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "secret"
      }
    });
    expect(config.mcp.servers.docs).toEqual({
      type: "http",
      url: "https://example.com/mcp",
      headers: {
        Authorization: "Bearer token"
      }
    });
    expect(config.mcp.servers.events).toEqual({
      type: "sse",
      url: "https://example.com/sse",
      headers: {}
    });
  });

  it("rejects invalid MCP server definitions", () => {
    expect(() =>
      appConfigSchema.parse({
        mcp: {
          servers: {
            github: {
              type: "stdio"
            }
          }
        }
      })
    ).toThrow();
  });

  it("rejects agents without description", () => {
    expect(() =>
      appConfigSchema.parse({
        agents: {
          reviewer: {
            prompt: "Review code"
          }
        }
      })
    ).toThrow();
  });

  it("rejects agents without prompt or promptFile", () => {
    expect(() =>
      appConfigSchema.parse({
        agents: {
          reviewer: {
            description: "Review code"
          }
        }
      })
    ).toThrow("Either prompt or promptFile must be specified");
  });

  it("applies Phase 2 defaults for memory and filesystem settings loading", () => {
    const config = appConfigSchema.parse({});

    expect(config.memory).toEqual({
      enabled: true,
      globalEnabled: false,
      maxLines: 200
    });
    expect(config.runtime.loadFilesystemSettings).toBe(true);
  });

  it("fills all new sections when parsing an empty config", () => {
    const config = appConfigSchema.parse({});

    expect(config.mcp).toEqual({ servers: {} });
    expect(config.agents).toEqual({});
    expect(config.memory).toEqual({
      enabled: true,
      globalEnabled: false,
      maxLines: 200
    });
    expect(config.skills).toEqual({
      enabled: true,
      directories: []
    });
    expect(config.runtime.loadFilesystemSettings).toBe(true);
    expect(config.runtime.soulFile).toBeUndefined();
    expect(config.runtime.userFile).toBeUndefined();
  });

  it("keeps a complete Phase 1 config valid", () => {
    const config = appConfigSchema.parse({
      channels: {
        telegram: {
          enabled: true,
          botToken: "telegram-token"
        }
      },
      runtime: {
        workingDirectory: "/tmp/project",
        model: "claude-sonnet",
        maxTurns: 6,
        systemPromptFile: "/tmp/system.md"
      },
      tools: {
        availableTools: ["Bash", "Read", "Write", "Edit"]
      },
      skills: {
        enabled: true,
        directories: ["/tmp/skills"]
      },
      logging: {
        level: "debug"
      }
    });

    expect(config.channels.telegram.enabled).toBe(true);
    expect(config.runtime.systemPromptFile).toBe("/tmp/system.md");
    expect(config.runtime.loadFilesystemSettings).toBe(true);
    expect(config.mcp.servers).toEqual({});
    expect(config.agents).toEqual({});
  });
});
