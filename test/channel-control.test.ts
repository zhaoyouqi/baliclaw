import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ChannelControlService } from "../src/channel/control.js";
import { getAppPaths } from "../src/config/paths.js";
import { appConfigSchema } from "../src/config/schema.js";
import { WeChatStateStore } from "../src/channel/wechat/state-store.js";

describe("ChannelControlService", () => {
  it("enables wechat and persists login state after a successful login wait", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-channel-control-"));
    const paths = getAppPaths(home);
    const config = appConfigSchema.parse({});
    const configService = {
      save: vi.fn().mockResolvedValue(undefined)
    } as never;
    const pairingService = {
      approvePrincipal: vi.fn().mockResolvedValue(undefined)
    } as never;
    const reloadConfig = vi.fn().mockResolvedValue({});
    const service = new ChannelControlService({
      configService,
      pairingService,
      getConfig: () => config,
      reloadConfig,
      wechatStateStore: new WeChatStateStore(paths),
      wechatLoginManager: {
        waitForLogin: vi.fn().mockResolvedValue({
          connected: true,
          message: "WeChat login completed.",
          token: "secret-token",
          apiBaseUrl: "https://ilinkai.weixin.qq.com",
          remoteAccountId: "bot@im.bot",
          userId: "wx-user-1"
        })
      } as never
    });

    try {
      await expect(service.waitForLogin({
        channel: "wechat",
        sessionKey: "session-123"
      })).resolves.toEqual({
        channel: "wechat",
        connected: true,
        message: "WeChat login completed."
      });

      expect(configService.save).toHaveBeenCalledWith(expect.objectContaining({
        channels: expect.objectContaining({
          wechat: expect.objectContaining({
            enabled: true
          })
        })
      }));
      expect(reloadConfig).toHaveBeenCalledTimes(1);
      expect(pairingService.approvePrincipal).toHaveBeenCalledWith({
        channel: "wechat",
        accountId: "default",
        principalKey: "wx-user-1"
      });

      const savedState = await new WeChatStateStore(paths).load();
      expect(savedState).toMatchObject({
        token: "secret-token",
        apiBaseUrl: "https://ilinkai.weixin.qq.com",
        remoteAccountId: "bot@im.bot",
        userId: "wx-user-1",
        contextTokens: {}
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
