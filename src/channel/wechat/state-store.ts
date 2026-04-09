import { readJson5FileOrDefault, writeJson5File } from "../../config/file-store.js";
import { getAppPaths, type AppPaths } from "../../config/paths.js";

export interface WeChatState {
  token?: string;
  apiBaseUrl?: string;
  remoteAccountId?: string;
  userId?: string;
  savedAt?: string;
  syncCursor?: string;
  contextTokens: Record<string, string>;
}

interface StoredWeChatState {
  token?: unknown;
  apiBaseUrl?: unknown;
  remoteAccountId?: unknown;
  userId?: unknown;
  savedAt?: unknown;
  syncCursor?: unknown;
  contextTokens?: unknown;
}

function getDefaultState(): WeChatState {
  return {
    contextTokens: {}
  };
}

export class WeChatStateStore {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<WeChatState> {
    const stored = await readJson5FileOrDefault<StoredWeChatState>(this.paths.wechatStateFile, {});
    return normalizeState(stored);
  }

  async save(state: WeChatState): Promise<void> {
    await writeJson5File(this.paths.wechatStateFile, {
      ...(state.token ? { token: state.token } : {}),
      ...(state.apiBaseUrl ? { apiBaseUrl: state.apiBaseUrl } : {}),
      ...(state.remoteAccountId ? { remoteAccountId: state.remoteAccountId } : {}),
      ...(state.userId ? { userId: state.userId } : {}),
      ...(state.savedAt ? { savedAt: state.savedAt } : {}),
      ...(state.syncCursor !== undefined ? { syncCursor: state.syncCursor } : {}),
      contextTokens: state.contextTokens
    });
  }

  async replaceLoginState(input: {
    token: string;
    apiBaseUrl?: string;
    remoteAccountId?: string;
    userId?: string;
  }): Promise<void> {
    const next: WeChatState = {
      token: input.token,
      ...(input.apiBaseUrl ? { apiBaseUrl: input.apiBaseUrl } : {}),
      ...(input.remoteAccountId ? { remoteAccountId: input.remoteAccountId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      savedAt: new Date().toISOString(),
      syncCursor: "",
      contextTokens: {}
    };
    await this.save(next);
  }

  async getSyncCursor(): Promise<string> {
    const state = await this.load();
    return state.syncCursor ?? "";
  }

  async setSyncCursor(syncCursor: string): Promise<void> {
    const state = await this.load();
    state.syncCursor = syncCursor;
    await this.save(state);
  }

  async getContextToken(userId: string): Promise<string | undefined> {
    const normalizedUserId = userId.trim();
    if (normalizedUserId.length === 0) {
      return undefined;
    }

    const state = await this.load();
    return state.contextTokens[normalizedUserId];
  }

  async setContextToken(userId: string, token: string): Promise<void> {
    const normalizedUserId = userId.trim();
    const normalizedToken = token.trim();

    if (normalizedUserId.length === 0 || normalizedToken.length === 0) {
      return;
    }

    const state = await this.load();
    state.contextTokens[normalizedUserId] = normalizedToken;
    await this.save(state);
  }
}

function normalizeState(raw: StoredWeChatState): WeChatState {
  const next = getDefaultState();

  if (typeof raw.token === "string" && raw.token.trim().length > 0) {
    next.token = raw.token.trim();
  }
  if (typeof raw.apiBaseUrl === "string" && raw.apiBaseUrl.trim().length > 0) {
    next.apiBaseUrl = raw.apiBaseUrl.trim();
  }
  if (typeof raw.remoteAccountId === "string" && raw.remoteAccountId.trim().length > 0) {
    next.remoteAccountId = raw.remoteAccountId.trim();
  }
  if (typeof raw.userId === "string" && raw.userId.trim().length > 0) {
    next.userId = raw.userId.trim();
  }
  if (typeof raw.savedAt === "string" && raw.savedAt.trim().length > 0) {
    next.savedAt = raw.savedAt.trim();
  }
  if (typeof raw.syncCursor === "string") {
    next.syncCursor = raw.syncCursor;
  }
  if (typeof raw.contextTokens === "object" && raw.contextTokens !== null) {
    const contextTokens: Record<string, string> = {};

    for (const [rawUserId, rawToken] of Object.entries(raw.contextTokens)) {
      if (typeof rawToken !== "string") {
        continue;
      }

      const userId = rawUserId.trim();
      const token = rawToken.trim();
      if (userId.length === 0 || token.length === 0) {
        continue;
      }

      contextTokens[userId] = token;
    }

    next.contextTokens = contextTokens;
  }

  return next;
}
