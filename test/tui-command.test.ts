import { describe, expect, it } from "vitest";
import { buildTuiAgentRunOptions, parseTuiInput } from "../src/cli/commands/tui.js";
import type { AppConfig } from "../src/config/schema.js";

const baseConfig: AppConfig = {
  channels: {
    telegram: {
      enabled: false,
      botToken: ""
    }
  },
  runtime: {
    workingDirectory: "/tmp/baliclaw-workdir",
    model: "claude-sonnet-4-5",
    maxTurns: 8,
    loadFilesystemSettings: true
  },
  tools: {
    availableTools: ["Read", "Write"]
  },
  skills: {
    enabled: true,
    directories: ["/tmp/skills"]
  },
  logging: {
    level: "info"
  },
  mcp: {
    servers: {
      docs: {
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer token"
        }
      }
    }
  },
  agents: {
    helper: {
      description: "Helper agent",
      prompt: "assist"
    }
  },
  memory: {
    enabled: true,
    globalEnabled: false,
    maxLines: 300
  }
};

describe("TUI command helpers", () => {
  it("parses TUI control commands", () => {
    expect(parseTuiInput("/help")).toEqual({ command: "help" });
    expect(parseTuiInput(" /new ")).toEqual({ command: "new" });
    expect(parseTuiInput("/exit")).toEqual({ command: "exit" });
    expect(parseTuiInput("/quit")).toEqual({ command: "quit" });
  });

  it("parses normal prompt input", () => {
    expect(parseTuiInput("  tell me a joke ")).toEqual({ prompt: "tell me a joke" });
    expect(parseTuiInput("   ")).toEqual({});
  });

  it("builds agent options from runtime config", () => {
    const options = buildTuiAgentRunOptions(baseConfig, "tui-session-1");

    expect(options).toEqual({
      cwd: "/tmp/baliclaw-workdir",
      sessionId: "tui-session-1",
      model: "claude-sonnet-4-5",
      maxTurns: 8,
      loadFilesystemSettings: true,
      tools: ["Read", "Write"],
      skillDirectories: ["/tmp/skills"],
      mcpServers: {
        docs: {
          type: "http",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer token"
          }
        }
      },
      agents: {
        helper: {
          description: "Helper agent",
          prompt: "assist"
        }
      },
      memoryEnabled: true,
      memoryMaxLines: 300
    });
  });

  it("does not pass skill directories when skills are disabled", () => {
    const config: AppConfig = {
      ...baseConfig,
      skills: {
        enabled: false,
        directories: ["/tmp/ignored"]
      }
    };

    const options = buildTuiAgentRunOptions(config, "tui-session-2");
    expect(options.skillDirectories).toBeUndefined();
  });
});
