import { createHash } from "node:crypto";
import { query as sdkQuery, type SDKMessage, type SDKResultError, type SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./prompts.js";
import { loadPromptOnlySkills } from "./skills.js";
import { getPhase1ToolPolicy } from "./tool-policy.js";

export interface QueryRequest {
  prompt: string;
  sessionId: string;
  cwd: string;
  resumeSessionId?: string;
  model?: string;
  maxTurns?: number;
  systemPromptFile?: string;
  skillDirectories?: string[];
  tools?: string[];
}

export interface QueryUsage {
  totalCostUsd?: number;
  turns?: number;
}

export interface QueryResult {
  text: string;
  sessionId: string;
  usage?: QueryUsage;
}

export interface QueryAgentDependencies {
  buildSystemPrompt?: typeof buildSystemPrompt;
  loadPromptOnlySkills?: typeof loadPromptOnlySkills;
  query?: typeof sdkQuery;
}

export async function queryAgent(
  request: QueryRequest,
  dependencies: QueryAgentDependencies = {}
): Promise<QueryResult> {
  const buildPrompt = dependencies.buildSystemPrompt ?? buildSystemPrompt;
  const loadSkills = dependencies.loadPromptOnlySkills ?? loadPromptOnlySkills;
  const runQuery = dependencies.query ?? sdkQuery;

  const skillOptions: { workingDirectory: string; extraDirectories?: string[] } = {
    workingDirectory: request.cwd
  };
  if (request.skillDirectories) {
    skillOptions.extraDirectories = request.skillDirectories;
  }

  const skillPrompts = await loadSkills(skillOptions);

  const promptOptions: {
    workingDirectory: string;
    systemPromptFile?: string;
    skillPrompts: typeof skillPrompts;
  } = {
    workingDirectory: request.cwd,
    skillPrompts
  };
  if (request.systemPromptFile) {
    promptOptions.systemPromptFile = request.systemPromptFile;
  }

  const systemPrompt = await buildPrompt(promptOptions);
  const toolPolicy = getPhase1ToolPolicy(
    request.tools
      ? {
          tools: {
            availableTools: request.tools
          }
        }
      : undefined
  );
  const deterministicClaudeSessionId = toClaudeSessionUuid(request.sessionId);

  try {
    return await executeSdkQuery(
      {
        prompt: request.prompt,
        options: createSdkQueryOptions({
          request,
          systemPrompt,
          toolPolicy,
          deterministicClaudeSessionId,
          ...(request.resumeSessionId ? { resumeSessionId: request.resumeSessionId } : {})
        })
      },
      runQuery
    );
  } catch (error) {
    if (request.resumeSessionId || !isSessionAlreadyInUseError(error)) {
      throw error;
    }

    return executeSdkQuery(
      {
        prompt: request.prompt,
        options: createSdkQueryOptions({
          request,
          systemPrompt,
          toolPolicy,
          resumeSessionId: deterministicClaudeSessionId,
          deterministicClaudeSessionId
        })
      },
      runQuery
    );
  }
}

function isSdkResultMessage(message: SDKMessage): message is SDKResultSuccess | SDKResultError {
  return message.type === "result";
}

interface SdkQueryOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  model?: string;
  maxTurns: number;
  sessionId?: string;
  resume?: string;
  permissionMode: "bypassPermissions";
  allowDangerouslySkipPermissions: true;
  tools: string[];
  stderr: (data: string) => void;
  systemPrompt: {
    type: "preset";
    preset: "claude_code";
    append: string;
  };
}

function createSdkQueryOptions(params: {
  request: QueryRequest;
  systemPrompt: string;
  toolPolicy: ReturnType<typeof getPhase1ToolPolicy>;
  resumeSessionId?: string;
  deterministicClaudeSessionId: string;
}): SdkQueryOptions {
  const options: SdkQueryOptions = {
    cwd: params.request.cwd,
    env: buildClaudeProcessEnv(),
    maxTurns: params.request.maxTurns ?? 8,
    permissionMode: params.toolPolicy.permissionMode,
    allowDangerouslySkipPermissions: params.toolPolicy.allowDangerouslySkipPermissions,
    tools: params.toolPolicy.tools,
    stderr: createStderrCollector(),
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: params.systemPrompt
    }
  };

  if (params.resumeSessionId) {
    options.resume = params.resumeSessionId;
  } else {
    options.sessionId = params.deterministicClaudeSessionId;
  }

  if (params.request.model) {
    options.model = params.request.model;
  }

  return options;
}

async function executeSdkQuery(
  params: {
    prompt: string;
    options: SdkQueryOptions;
  },
  runQuery: typeof sdkQuery
): Promise<QueryResult> {
  const stderrOutput = getCollectedStderr(params.options.stderr);

  try {
    const stream = runQuery(params);
    let finalResult: SDKResultSuccess | SDKResultError | null = null;

    for await (const message of stream) {
      if (isSdkResultMessage(message)) {
        finalResult = message;
      }
    }

    if (!finalResult) {
      throw new Error("Claude Agent SDK did not return a final result");
    }

    if (finalResult.subtype !== "success") {
      const reason = finalResult.errors[0] ?? finalResult.subtype;
      throw new Error(`Claude Agent SDK failed: ${reason}`);
    }

    return {
      text: finalResult.result,
      sessionId: finalResult.session_id,
      usage: {
        totalCostUsd: finalResult.total_cost_usd,
        turns: finalResult.num_turns
      }
    };
  } catch (error) {
    throw withStderrContext(error, stderrOutput());
  }
}

function toClaudeSessionUuid(sessionId: string): string {
  const hash = createHash("sha1").update(sessionId).digest();
  const versionByte = hash[6] ?? 0;
  const variantByte = hash[8] ?? 0;

  hash[6] = (versionByte & 0x0f) | 0x50;
  hash[8] = (variantByte & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function buildClaudeProcessEnv(): Record<string, string | undefined> {
  const env = { ...process.env };

  delete env.http_proxy;
  delete env.HTTP_PROXY;
  delete env.https_proxy;
  delete env.HTTPS_PROXY;
  delete env.all_proxy;
  delete env.ALL_PROXY;

  return env;
}

function createStderrCollector(): (data: string) => void {
  const chunks: string[] = [];

  const collector = (data: string): void => {
    if (data.length === 0) {
      return;
    }

    chunks.push(data);

    if (chunks.length > 20) {
      chunks.shift();
    }
  };

  Reflect.set(collector, "__getCollectedStderr", () => chunks.join("").trim());

  return collector;
}

function getCollectedStderr(collector: (data: string) => void): () => string {
  const getter = Reflect.get(collector, "__getCollectedStderr");
  return typeof getter === "function" ? getter as () => string : () => "";
}

function withStderrContext(error: unknown, stderr: string): Error {
  if (!(error instanceof Error) || stderr.length === 0) {
    return error instanceof Error ? error : new Error(String(error));
  }

  return new Error(`${error.message}\nClaude stderr: ${stderr}`, {
    cause: error
  });
}

function isSessionAlreadyInUseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("session id") && message.includes("already in use");
}
