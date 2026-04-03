import { defaultAvailableTools, type AppConfig } from "../config/schema.js";

export interface ToolPolicy {
  permissionMode: "bypassPermissions" | "dontAsk";
  allowDangerouslySkipPermissions?: true;
  tools: string[];
}

export function getPhase1ToolPolicy(
  config?: Pick<AppConfig, "tools">,
  options: { isRoot?: boolean } = {}
): ToolPolicy {
  return {
    ...getPermissionSettings(options.isRoot ?? isRunningAsRoot()),
    tools: [...(config?.tools.availableTools ?? defaultAvailableTools)]
  };
}

export function getToolPolicy(
  config: {
    tools: Pick<AppConfig["tools"], "availableTools">;
    mcp: { servers: Record<string, unknown> };
    runtime: Pick<AppConfig["runtime"], "loadFilesystemSettings">;
    agents: Record<string, unknown>;
  },
  options: { isRoot?: boolean } = {}
): ToolPolicy {
  const tools = [...config.tools.availableTools];

  for (const serverName of Object.keys(config.mcp.servers)) {
    const wildcard = `mcp__${serverName}__*`;
    if (!tools.includes(wildcard)) {
      tools.push(wildcard);
    }
  }

  if (config.runtime.loadFilesystemSettings && !tools.includes("Skill")) {
    tools.push("Skill");
  }

  if (Object.keys(config.agents).length > 0 && !tools.includes("Agent")) {
    tools.push("Agent");
  }

  return {
    ...getPermissionSettings(options.isRoot ?? isRunningAsRoot()),
    tools
  };
}

function getPermissionSettings(isRoot: boolean): Pick<ToolPolicy, "permissionMode" | "allowDangerouslySkipPermissions"> {
  if (isRoot) {
    return {
      permissionMode: "dontAsk"
    };
  }

  return {
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true
  };
}

function isRunningAsRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}
