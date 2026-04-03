import { describe, expect, it } from "vitest";
import { getToolPolicy } from "../src/runtime/tool-policy.js";

describe("getToolPolicy", () => {
  it("matches Phase 1 behavior when no Phase 2 features are enabled", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Bash", "Read", "Write", "Edit"]
        },
        mcp: {
          servers: {}
        },
        runtime: {
          loadFilesystemSettings: false
        },
        agents: {}
      }, { isRoot: false })
    ).toEqual({
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: ["Bash", "Read", "Write", "Edit"]
    });
  });

  it("adds one wildcard entry per configured MCP server", () => {
    const policy = getToolPolicy({
      tools: {
        availableTools: ["Read"]
      },
      mcp: {
        servers: {
          github: {
            type: "stdio",
            command: "npx",
            args: [],
            env: {}
          },
          docs: {
            type: "http",
            url: "https://example.com/mcp",
            headers: {}
          }
        }
      },
      runtime: {
        loadFilesystemSettings: false
      },
      agents: {}
    }, { isRoot: false });

    expect(policy.tools).toEqual(["Read", "mcp__github__*", "mcp__docs__*"]);
  });

  it("does not duplicate MCP wildcards already present in the base allowlist", () => {
    const policy = getToolPolicy({
      tools: {
        availableTools: ["Read", "mcp__github__*"]
      },
      mcp: {
        servers: {
          github: {
            type: "stdio",
            command: "npx",
            args: [],
            env: {}
          }
        }
      },
      runtime: {
        loadFilesystemSettings: false
      },
      agents: {}
    }, { isRoot: false });

    expect(policy.tools).toEqual(["Read", "mcp__github__*"]);
  });

  it("adds the Skill tool when filesystem settings loading is enabled", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Read"]
        },
        mcp: {
          servers: {}
        },
        runtime: {
          loadFilesystemSettings: true
        },
        agents: {}
      }, { isRoot: false }).tools
    ).toEqual(["Read", "Skill"]);
  });

  it("adds the Agent tool when custom agents are configured", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Read"]
        },
        mcp: {
          servers: {}
        },
        runtime: {
          loadFilesystemSettings: false
        },
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code."
          }
        }
      }, { isRoot: false }).tools
    ).toEqual(["Read", "Agent"]);
  });

  it("does not duplicate Agent when the user already allowed it explicitly", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Read", "Agent"]
        },
        mcp: {
          servers: {}
        },
        runtime: {
          loadFilesystemSettings: false
        },
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code."
          }
        }
      }, { isRoot: false }).tools
    ).toEqual(["Read", "Agent"]);
  });

  it("uses dontAsk without dangerous skip when running as root", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Bash", "Read", "Write", "Edit"]
        },
        mcp: {
          servers: {}
        },
        runtime: {
          loadFilesystemSettings: true
        },
        agents: {}
      }, { isRoot: true })
    ).toEqual({
      permissionMode: "dontAsk",
      tools: ["Bash", "Read", "Write", "Edit", "Skill"]
    });
  });
});
