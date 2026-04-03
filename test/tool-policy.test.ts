import { describe, expect, it } from "vitest";
import { getPhase1ToolPolicy } from "../src/runtime/tool-policy.js";

describe("getPhase1ToolPolicy", () => {
  it("uses the Phase 1 default tool set", () => {
    expect(getPhase1ToolPolicy(undefined, { isRoot: false })).toEqual({
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: ["Bash", "Read", "Write", "Edit"]
    });
  });

  it("allows the config to override the tool allowlist", () => {
    expect(
      getPhase1ToolPolicy({
        tools: {
          availableTools: ["Read", "Bash"]
        }
      }, { isRoot: false })
    ).toEqual({
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: ["Read", "Bash"]
    });
  });

  it("returns a copy of the allowlist", () => {
    const policy = getPhase1ToolPolicy({
      tools: {
        availableTools: ["Read"]
      }
    }, { isRoot: false });

    policy.tools.push("Write");

    expect(
      getPhase1ToolPolicy({
        tools: {
          availableTools: ["Read"]
        }
      }, { isRoot: false }).tools
    ).toEqual(["Read"]);
  });

  it("uses dontAsk without dangerous skip when running as root", () => {
    expect(getPhase1ToolPolicy(undefined, { isRoot: true })).toEqual({
      permissionMode: "dontAsk",
      tools: ["Bash", "Read", "Write", "Edit"]
    });
  });
});
