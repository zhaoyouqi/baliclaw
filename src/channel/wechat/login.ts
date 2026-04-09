import { randomUUID } from "node:crypto";
import { fetchQrCode, pollQrStatus } from "./api.js";

const ACTIVE_LOGIN_TTL_MS = 5 * 60_000;
const DEFAULT_WAIT_TIMEOUT_MS = 8 * 60_000;
const POLL_INTERVAL_MS = 1_500;

interface ActiveLogin {
  sessionKey: string;
  qrcode: string;
  qrDataUrl: string;
  startedAt: number;
  currentApiBaseUrl: string;
}

export interface WeChatLoginStartResult {
  sessionKey: string;
  qrDataUrl?: string | undefined;
  message: string;
}

export interface WeChatLoginWaitResult {
  connected: boolean;
  message: string;
  token?: string | undefined;
  remoteAccountId?: string | undefined;
  apiBaseUrl?: string | undefined;
  userId?: string | undefined;
}

export class WeChatLoginManager {
  private readonly activeLogins = new Map<string, ActiveLogin>();

  constructor(
    private readonly fetchQrCodeImpl = fetchQrCode,
    private readonly pollQrStatusImpl = pollQrStatus,
    private readonly now = () => Date.now()
  ) {}

  async startLogin(input: {
    apiBaseUrl: string;
    botType: string;
    sessionKey?: string;
    force?: boolean;
  }): Promise<WeChatLoginStartResult> {
    this.purgeExpiredLogins();

    const sessionKey = input.sessionKey ?? randomUUID();
    const existing = this.activeLogins.get(sessionKey);

    if (!input.force && existing && this.isFresh(existing)) {
      return {
        sessionKey,
        qrDataUrl: existing.qrDataUrl,
        message: "QR code is ready. Scan it with WeChat to continue."
      };
    }

    const response = await this.fetchQrCodeImpl({
      baseUrl: input.apiBaseUrl,
      botType: input.botType
    });

    if (!response.qrcode || !response.qrcode_img_content) {
      return {
        sessionKey,
        message: "Failed to create a WeChat QR code."
      };
    }

    this.activeLogins.set(sessionKey, {
      sessionKey,
      qrcode: response.qrcode,
      qrDataUrl: response.qrcode_img_content,
      startedAt: this.now(),
      currentApiBaseUrl: input.apiBaseUrl
    });

    return {
      sessionKey,
      qrDataUrl: response.qrcode_img_content,
      message: "Scan the QR code with WeChat to complete login."
    };
  }

  async waitForLogin(input: {
    sessionKey: string;
    timeoutMs?: number;
  }): Promise<WeChatLoginWaitResult> {
    const login = this.activeLogins.get(input.sessionKey);

    if (!login) {
      return {
        connected: false,
        message: "No active WeChat login session exists."
      };
    }

    if (!this.isFresh(login)) {
      this.activeLogins.delete(input.sessionKey);
      return {
        connected: false,
        message: "The WeChat QR code has expired. Start login again."
      };
    }

    const deadline = this.now() + Math.max(1_000, input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS);

    while (this.now() < deadline) {
      const status = await this.pollQrStatusImpl({
        baseUrl: login.currentApiBaseUrl,
        qrcode: login.qrcode
      });

      if (status.status === "confirmed" && status.bot_token && status.ilink_bot_id) {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: true,
          message: "WeChat login completed.",
          token: status.bot_token,
          remoteAccountId: status.ilink_bot_id,
          apiBaseUrl: status.baseurl ?? login.currentApiBaseUrl,
          userId: status.ilink_user_id
        };
      }

      if (status.status === "expired") {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: false,
          message: "The WeChat QR code expired before login completed."
        };
      }

      if (status.status === "scaned_but_redirect" && status.redirect_host) {
        login.currentApiBaseUrl = normalizeRedirectBaseUrl(status.redirect_host, login.currentApiBaseUrl);
      }

      await sleep(POLL_INTERVAL_MS);
    }

    this.activeLogins.delete(input.sessionKey);
    return {
      connected: false,
      message: "Timed out while waiting for WeChat login confirmation."
    };
  }

  private purgeExpiredLogins(): void {
    for (const [sessionKey, login] of this.activeLogins) {
      if (!this.isFresh(login)) {
        this.activeLogins.delete(sessionKey);
      }
    }
  }

  private isFresh(login: ActiveLogin): boolean {
    return this.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
  }
}

function normalizeRedirectBaseUrl(redirectHost: string, fallbackBaseUrl: string): string {
  if (redirectHost.startsWith("http://") || redirectHost.startsWith("https://")) {
    return redirectHost;
  }

  const fallbackUrl = new URL(fallbackBaseUrl);
  return `${fallbackUrl.protocol}//${redirectHost}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
