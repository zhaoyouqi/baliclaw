import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getAppPaths } from "../src/config/paths.js";
import { WeChatService } from "../src/channel/wechat/service.js";
import { WeChatStateStore } from "../src/channel/wechat/state-store.js";
import { MessageItemType } from "../src/channel/wechat/types.js";

describe("WeChatService", () => {
  it("starts polling, forwards normalized inbound messages, and persists cursor/context tokens", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-wechat-service-"));
    const paths = getAppPaths(home);
    const stateStore = new WeChatStateStore(paths);
    await stateStore.replaceLoginState({
      token: "secret-token",
      apiBaseUrl: "https://ilinkai.weixin.qq.com",
      remoteAccountId: "bot@im.bot"
    });

    const onInbound = vi.fn();
    const getUpdatesImpl = vi.fn()
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "cursor-123",
        msgs: [{
          from_user_id: "wx-user-1",
          context_token: "ctx-123",
          message_id: 42,
          item_list: [{
            type: MessageItemType.TEXT,
            text_item: {
              text: "hello"
            }
          }]
        }]
      })
      .mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
        await new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          }, { once: true });
        });
      });

    const service = new WeChatService({
      stateStore,
      getUpdates: getUpdatesImpl as never,
      onInbound
    });

    try {
      await service.start();
      await vi.waitFor(() => {
        expect(onInbound).toHaveBeenCalledTimes(1);
      });

      expect(onInbound).toHaveBeenCalledWith({
        message: {
          channel: "wechat",
          accountId: "default",
          chatType: "direct",
          conversationId: "wx-user-1",
          senderId: "wx-user-1",
          messageId: "42",
          text: "hello"
        },
        deliveryTarget: {
          channel: "wechat",
          accountId: "default",
          chatType: "direct",
          conversationId: "wx-user-1"
        },
        sessionKey: "wechat:default:direct:wx-user-1",
        principalKey: "wx-user-1"
      });
      await expect(stateStore.getSyncCursor()).resolves.toBe("cursor-123");
      await expect(stateStore.getContextToken("wx-user-1")).resolves.toBe("ctx-123");
    } finally {
      await service.stop();
      await rm(home, { recursive: true, force: true });
    }
  });
});
