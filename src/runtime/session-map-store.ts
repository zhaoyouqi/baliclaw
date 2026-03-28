import { readJson5FileOrDefault, writeJson5File } from "../config/file-store.js";
import { getAppPaths, type AppPaths } from "../config/paths.js";

export interface ClaudeSessionMapData {
  sessions: Record<string, string>;
}

const defaultSessionMapData = (): ClaudeSessionMapData => ({
  sessions: {}
});

export class ClaudeSessionMapStore {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<ClaudeSessionMapData> {
    return readJson5FileOrDefault<ClaudeSessionMapData>(
      this.paths.claudeSessionMapFile,
      defaultSessionMapData()
    );
  }

  async get(businessSessionId: string): Promise<string | undefined> {
    const data = await this.load();
    return data.sessions[businessSessionId];
  }

  async set(businessSessionId: string, claudeSessionId: string): Promise<void> {
    const data = await this.load();
    data.sessions[businessSessionId] = claudeSessionId;
    await writeJson5File(this.paths.claudeSessionMapFile, data);
  }
}
