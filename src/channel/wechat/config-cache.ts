import { getConfig, type WeChatApiOptions } from "./api.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60 * 60 * 1000;

interface CacheEntry {
  typingTicket: string;
  nextFetchAt: number;
  retryDelayMs: number;
}

export class WeChatConfigCache {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly apiOptions: Pick<WeChatApiOptions, "baseUrl" | "token">,
    private readonly getConfigImpl = getConfig
  ) {}

  async getTypingTicket(userId: string, contextToken?: string): Promise<string> {
    const normalizedUserId = userId.trim();
    if (normalizedUserId.length === 0) {
      return "";
    }

    const now = Date.now();
    const existing = this.cache.get(normalizedUserId);
    if (existing && now < existing.nextFetchAt) {
      return existing.typingTicket;
    }

    try {
      const response = await this.getConfigImpl({
        baseUrl: this.apiOptions.baseUrl,
        token: this.apiOptions.token,
        ilinkUserId: normalizedUserId,
        contextToken
      });

      if (response.ret === 0 && typeof response.typing_ticket === "string") {
        const ticket = response.typing_ticket;
        this.cache.set(normalizedUserId, {
          typingTicket: ticket,
          nextFetchAt: now + CACHE_TTL_MS,
          retryDelayMs: INITIAL_RETRY_MS
        });
        return ticket;
      }
    } catch {
      // Best effort cache refresh; the caller will simply skip typing.
    }

    const retryDelayMs = Math.min(existing?.retryDelayMs ?? INITIAL_RETRY_MS, MAX_RETRY_MS);
    this.cache.set(normalizedUserId, {
      typingTicket: existing?.typingTicket ?? "",
      nextFetchAt: now + retryDelayMs,
      retryDelayMs: Math.min(retryDelayMs * 2, MAX_RETRY_MS)
    });
    return existing?.typingTicket ?? "";
  }
}
