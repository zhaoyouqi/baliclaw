import { buildSystemPrompt } from "./prompts.js";
import { getPhase1ToolPolicy } from "./tool-policy.js";

export interface QueryRequest {
  prompt: string;
  sessionId: string;
  cwd: string;
}

export async function queryAgent(request: QueryRequest): Promise<string> {
  void request;
  void buildSystemPrompt;
  void getPhase1ToolPolicy;
  return "Agent integration placeholder";
}

