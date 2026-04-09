import { describe, expect, it, vi } from "vitest";
import { WeChatLoginManager } from "../src/channel/wechat/login.js";

describe("WeChatLoginManager", () => {
  it("starts a QR session and completes login when the remote API confirms it", async () => {
    const fetchQrCodeImpl = vi.fn().mockResolvedValue({
      qrcode: "qr-123",
      qrcode_img_content: "https://example.com/qr"
    });
    const pollQrStatusImpl = vi.fn().mockResolvedValue({
      status: "confirmed",
      bot_token: "secret-token",
      ilink_bot_id: "bot@im.bot",
      baseurl: "https://ilinkai.weixin.qq.com",
      ilink_user_id: "wx-user-1"
    });

    const manager = new WeChatLoginManager(fetchQrCodeImpl, pollQrStatusImpl);
    const startResult = await manager.startLogin({
      apiBaseUrl: "https://ilinkai.weixin.qq.com",
      botType: "3"
    });

    expect(startResult).toEqual({
      sessionKey: expect.any(String),
      qrDataUrl: "https://example.com/qr",
      message: "Scan the QR code with WeChat to complete login."
    });

    await expect(manager.waitForLogin({
      sessionKey: startResult.sessionKey,
      timeoutMs: 5_000
    })).resolves.toEqual({
      connected: true,
      message: "WeChat login completed.",
      token: "secret-token",
      remoteAccountId: "bot@im.bot",
      apiBaseUrl: "https://ilinkai.weixin.qq.com",
      userId: "wx-user-1"
    });
  });

  it("expires stale sessions before waiting", async () => {
    let now = 0;
    const manager = new WeChatLoginManager(
      vi.fn().mockResolvedValue({
        qrcode: "qr-123",
        qrcode_img_content: "https://example.com/qr"
      }),
      vi.fn(),
      () => now
    );

    const startResult = await manager.startLogin({
      apiBaseUrl: "https://ilinkai.weixin.qq.com",
      botType: "3"
    });
    now = 6 * 60_000;

    await expect(manager.waitForLogin({
      sessionKey: startResult.sessionKey
    })).resolves.toEqual({
      connected: false,
      message: "The WeChat QR code has expired. Start login again."
    });
  });
});
