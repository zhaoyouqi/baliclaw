import { readFile } from "node:fs/promises";
import { join } from "node:path";

const baseSystemPrompt = "You are the BaliClaw Phase 1 agent.";

export interface PromptSkill {
  name: string;
  content: string;
}

export interface BuildSystemPromptOptions {
  workingDirectory: string;
  systemPromptFile?: string;
  skillPrompts?: PromptSkill[];
}

export async function buildSystemPrompt(options: BuildSystemPromptOptions): Promise<string> {
  const sections: string[] = [baseSystemPrompt];
  const agentsContent = await readOptionalTextFile(join(options.workingDirectory, "AGENTS.md"));

  if (agentsContent) {
    sections.push(renderSection("AGENTS.md", agentsContent));
  }

  if (options.systemPromptFile) {
    const extraPrompt = await readOptionalTextFile(options.systemPromptFile);
    if (extraPrompt) {
      sections.push(renderSection("SYSTEM PROMPT", extraPrompt));
    }
  }

  for (const skill of options.skillPrompts ?? []) {
    if (skill.content.trim().length > 0) {
      sections.push(renderSection(`SKILL: ${skill.name}`, skill.content));
    }
  }

  return sections.join("\n\n");
}

async function readOptionalTextFile(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf8");
    return content.trim().length > 0 ? content.trim() : null;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function renderSection(title: string, content: string): string {
  return `=== ${title} ===\n${content.trim()}`;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
