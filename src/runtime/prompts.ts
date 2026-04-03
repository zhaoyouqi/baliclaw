import { readFile } from "node:fs/promises";
import { join } from "node:path";

const baseSystemPrompt = "You are the BaliClaw Phase 1 agent.";

export interface PromptSkill {
  name: string;
  content: string;
}

export interface BuildSystemPromptOptions {
  workingDirectory: string;
  soulFile?: string;
  userFile?: string;
  systemPromptFile?: string;
  memoryEnabled?: boolean;
  memoryContent?: string;
  memoryFilePath?: string;
  skillPrompts?: PromptSkill[];
}

export async function buildSystemPrompt(options: BuildSystemPromptOptions): Promise<string> {
  const sections: string[] = [baseSystemPrompt];
  const soulContent = await readOptionalTextFile(options.soulFile ?? join(options.workingDirectory, "SOUL.md"));
  const userContent = await readOptionalTextFile(options.userFile ?? join(options.workingDirectory, "USER.md"));
  const agentsContent = await readOptionalTextFile(join(options.workingDirectory, "AGENTS.md"));

  if (soulContent) {
    sections.push(renderSection("SOUL.md", soulContent));
  }
  if (userContent) {
    sections.push(renderUserSection(userContent));
  }

  if (agentsContent) {
    sections.push(renderSection("AGENTS.md", agentsContent));
  }

  if (options.systemPromptFile) {
    const extraPrompt = await readOptionalTextFile(options.systemPromptFile);
    if (extraPrompt) {
      sections.push(renderSection("SYSTEM PROMPT", extraPrompt));
    }
  }

  if (options.memoryEnabled) {
    if (!options.memoryFilePath) {
      throw new Error("memoryFilePath is required when memoryEnabled is true");
    }

    sections.push(renderMemorySection(options.memoryFilePath, options.memoryContent ?? ""));
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

function renderUserSection(content: string): string {
  return [
    "=== USER.md ===",
    "This file describes the user. Keep it updated when you learn durable preferences or context.",
    "Use the Write or Edit tool to correct outdated information instead of appending duplicate notes.",
    "Keep it concise and avoid sensitive information that does not improve future help.",
    "",
    content.trim()
  ].join("\n");
}

function renderMemorySection(memoryFilePath: string, memoryContent: string): string {
  const trimmedContent = memoryContent.trim();

  return [
    "=== PERSISTENT MEMORY ===",
    `You have a persistent memory file at ${memoryFilePath}. Its current contents are shown below.`,
    "",
    "## How to use memory:",
    "- Use the Edit or Write tool to update this file when you learn important information",
    "- Organize by topic, not chronologically",
    "- Keep it concise - this file is injected into every conversation",
    "- Remove outdated information when you notice it",
    "",
    "## What to remember:",
    "- Project architecture decisions and conventions",
    "- Recurring patterns and solutions",
    "- Important context from past conversations",
    "- Things the user explicitly asks you to remember",
    "",
    "## What NOT to remember:",
    "- Transient task details or in-progress state",
    "- Information already documented in project files",
    "- Sensitive credentials or secrets",
    "- Anything redundant with SOUL.md or USER.md",
    "",
    "## Current memory contents:",
    trimmedContent.length > 0 ? trimmedContent : "(empty)"
  ].join("\n");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
