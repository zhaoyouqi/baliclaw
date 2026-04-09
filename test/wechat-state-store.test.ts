import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAppPaths } from "../src/config/paths.js";
import { WeChatStateStore } from "../src/channel/wechat/state-store.js";

describe("WeChatStateStore", () => {
  it("persists login state, sync cursor, and context tokens", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-wechat-state-"));
    const store = new WeChatStateStore(getAppPaths(home));

    try {
      await store.replaceLoginState({
        token: "secret-token",
        apiBaseUrl: "https://ilinkai.weixin.qq.com",
        remoteAccountId: "bot@im.bot",
        userId: "wx-user-1"
      });
      await store.setSyncCursor("cursor-123");
      await store.setContextToken("wx-user-1", "ctx-123");

      const reloaded = await store.load();
      expect(reloaded).toMatchObject({
        token: "secret-token",
        apiBaseUrl: "https://ilinkai.weixin.qq.com",
        remoteAccountId: "bot@im.bot",
        userId: "wx-user-1",
        syncCursor: "cursor-123",
        contextTokens: {
          "wx-user-1": "ctx-123"
        }
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
