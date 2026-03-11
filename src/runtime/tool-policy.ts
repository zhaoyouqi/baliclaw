export function getPhase1ToolPolicy() {
  return {
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true
  };
}

