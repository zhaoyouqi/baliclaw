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
        skills: {
          enabled: true,
          directories: [],
          sdkNative: false
        },
        agents: {}
      })
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
      skills: {
        enabled: true,
        directories: [],
        sdkNative: false
      },
      agents: {}
    });

    expect(policy.tools).toEqual(["Read", "mcp__github__*", "mcp__docs__*"]);
  });

  it("adds the Skill tool when sdkNative skills are enabled", () => {
    expect(
      getToolPolicy({
        tools: {
          availableTools: ["Read"]
        },
        mcp: {
          servers: {}
        },
        skills: {
          enabled: true,
          directories: [],
          sdkNative: true
        },
        agents: {}
      }).tools
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
        skills: {
          enabled: true,
          directories: [],
          sdkNative: false
        },
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code."
          }
        }
      }).tools
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
        skills: {
          enabled: true,
          directories: [],
          sdkNative: false
        },
        agents: {
          reviewer: {
            description: "Review code",
            prompt: "You review code."
          }
        }
      }).tools
    ).toEqual(["Read", "Agent"]);
  });
});
