import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runConfigGetCommand, runConfigSetCommand } from "../src/cli/commands/config.js";
import type { AppConfig } from "../src/config/schema.js";

const config: AppConfig = {
  channels: {
    telegram: {
      enabled: false,
      botToken: ""
    }
  },
  runtime: {
    workingDirectory: "/tmp/baliclaw"
  },
  tools: {
    availableTools: ["Bash", "Read", "Write", "Edit"]
  },
  skills: {
    enabled: true,
    directories: [],
    sdkNative: true
  },
  logging: {
    level: "info"
  },
  mcp: {
    servers: {}
  },
  agents: {},
  memory: {
    enabled: true,
    globalEnabled: false,
    maxLines: 200
  }
};

describe("CLI config commands", () => {
  it("prints the current config from IPC", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config)
    } as never;

    await expect(runConfigGetCommand(client)).resolves.toBe(JSON.stringify(config, null, 2));
  });

  it("updates config from inline JSON5", async () => {
    const client = {
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    const output = await runConfigSetCommand(
      `{ channels: { telegram: { enabled: false, botToken: "" } }, runtime: { workingDirectory: "/tmp/updated" }, tools: { availableTools: ["Bash"] }, skills: { enabled: true, directories: [] }, logging: { level: "warn" } }`,
      {},
      client
    );

    expect(client.setConfig).toHaveBeenCalledWith({
      channels: {
        telegram: {
          enabled: false,
          botToken: ""
        }
      },
      runtime: {
        workingDirectory: "/tmp/updated"
      },
      tools: {
        availableTools: ["Bash"]
      },
      skills: {
        enabled: true,
        directories: [],
        sdkNative: true
      },
      logging: {
        level: "warn"
      },
      mcp: {
        servers: {}
      },
      agents: {},
      memory: {
        enabled: true,
        globalEnabled: false,
        maxLines: 200
      }
    });
    expect(output).toContain("\"workingDirectory\": \"/tmp/updated\"");
  });

  it("updates config from a file payload", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-cli-config-"));
    const file = join(home, "config.json5");
    const client = {
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    try {
      await writeFile(
        file,
        `{ channels: { telegram: { enabled: false, botToken: "" } }, runtime: { workingDirectory: "/tmp/from-file" }, tools: { availableTools: ["Read"] }, skills: { enabled: true, directories: [] }, logging: { level: "debug" } }\n`,
        "utf8"
      );

      await runConfigSetCommand(undefined, { file }, client);

      expect(client.setConfig).toHaveBeenCalledWith({
        channels: {
          telegram: {
            enabled: false,
            botToken: ""
          }
        },
        runtime: {
          workingDirectory: "/tmp/from-file"
        },
        tools: {
          availableTools: ["Read"]
        },
        skills: {
          enabled: true,
          directories: [],
          sdkNative: true
        },
        logging: {
          level: "debug"
        },
        mcp: {
          servers: {}
        },
        agents: {},
        memory: {
          enabled: true,
          globalEnabled: false,
          maxLines: 200
        }
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("updates a single config path using the current daemon config as a base", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    const output = await runConfigSetCommand(
      "8793336326:example-token",
      { path: "channels.telegram.botToken" },
      client
    );

    expect(client.getConfig).toHaveBeenCalledTimes(1);
    expect(client.setConfig).toHaveBeenCalledWith({
      ...config,
      channels: {
        telegram: {
          enabled: false,
          botToken: "8793336326:example-token"
        }
      }
    });
    expect(output).toContain("\"botToken\": \"8793336326:example-token\"");
  });

  it("rejects unknown config paths", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn()
    } as never;

    await expect(
      runConfigSetCommand("value", { path: "channels.telegram.missing" }, client)
    ).rejects.toThrow(/unrecognized_keys/);

    expect(client.setConfig).not.toHaveBeenCalled();
  });

  it("creates a new MCP server entry via --path", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    await runConfigSetCommand(
      '{ type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] }',
      { path: "mcp.servers.github" },
      client
    );

    expect(client.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: {
          servers: {
            github: {
              type: "stdio",
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {}
            }
          }
        }
      })
    );
  });

  it("creates intermediate objects for nested record paths", async () => {
    const configWithGithub: AppConfig = {
      ...config,
      mcp: {
        servers: {
          github: {
            type: "stdio" as const,
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {}
          }
        }
      }
    };

    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(configWithGithub),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    await runConfigSetCommand("updated-npx", { path: "mcp.servers.github.command" }, client);

    expect(client.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: {
          servers: {
            github: expect.objectContaining({
              command: "updated-npx"
            })
          }
        }
      })
    );
  });

  it("creates a new server entry via nested field path", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    await runConfigSetCommand("npx", { path: "mcp.servers.github.command" }, client);

    expect(client.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: {
          servers: {
            github: expect.objectContaining({
              command: "npx"
            })
          }
        }
      })
    );
  });

  it("updates memory.enabled through --path", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    await runConfigSetCommand("false", { path: "memory.enabled" }, client);

    expect(client.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: {
          enabled: false,
          globalEnabled: false,
          maxLines: 200
        }
      })
    );
  });

  it("updates skills.sdkNative through --path", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn<(value: AppConfig) => Promise<AppConfig>>().mockImplementation(async (value) => value)
    } as never;

    await runConfigSetCommand("false", { path: "skills.sdkNative" }, client);

    expect(client.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: {
          enabled: true,
          directories: [],
          sdkNative: false
        }
      })
    );
  });

  it("rejects invalid Phase 2 values through --path", async () => {
    const client = {
      getConfig: vi.fn<() => Promise<AppConfig>>().mockResolvedValue(config),
      setConfig: vi.fn()
    } as never;

    await expect(
      runConfigSetCommand("\"nope\"", { path: "memory.enabled" }, client)
    ).rejects.toThrow();

    expect(client.setConfig).not.toHaveBeenCalled();
  });
});
