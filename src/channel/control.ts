import type { AppConfig } from "../config/schema.js";
import { PairingService } from "../auth/pairing-service.js";
import { ConfigService } from "../config/service.js";
import { LarkLoginManager } from "./lark/login.js";
import { WeChatLoginManager } from "./wechat/login.js";
import { WeChatStateStore } from "./wechat/state-store.js";

export interface ChannelLoginStartResult {
  channel: string;
  sessionKey: string;
  qrDataUrl?: string;
  message: string;
}

export interface ChannelLoginWaitResult {
  channel: string;
  connected: boolean;
  message: string;
}

export interface ChannelControlServiceOptions {
  configService?: ConfigService;
  getConfig?: () => AppConfig | Promise<AppConfig>;
  reloadConfig?: () => Promise<object>;
  onChannelCredentialsUpdated?: (channel: string) => Promise<void> | void;
  pairingService?: Pick<PairingService, "approvePrincipal">;
  wechatLoginManager?: WeChatLoginManager;
  wechatStateStore?: WeChatStateStore;
  larkLoginManager?: LarkLoginManager;
}

export class ChannelControlService {
  private readonly configService: ConfigService;
  private readonly getConfig: () => AppConfig | Promise<AppConfig>;
  private readonly reloadConfig: (() => Promise<object>) | undefined;
  private readonly onChannelCredentialsUpdated: ((channel: string) => Promise<void> | void) | undefined;
  private readonly pairingService: Pick<PairingService, "approvePrincipal">;
  private readonly wechatLoginManager: WeChatLoginManager;
  private readonly wechatStateStore: WeChatStateStore;
  private readonly larkLoginManager: LarkLoginManager;

  constructor(options: ChannelControlServiceOptions = {}) {
    this.configService = options.configService ?? new ConfigService();
    this.getConfig = options.getConfig ?? (async () => await this.configService.load());
    this.reloadConfig = options.reloadConfig;
    this.onChannelCredentialsUpdated = options.onChannelCredentialsUpdated;
    this.pairingService = options.pairingService ?? new PairingService();
    this.wechatLoginManager = options.wechatLoginManager ?? new WeChatLoginManager();
    this.wechatStateStore = options.wechatStateStore ?? new WeChatStateStore();
    this.larkLoginManager = options.larkLoginManager ?? new LarkLoginManager();
  }

  async startLogin(input: {
    channel: string;
    force?: boolean;
    mode?: "new" | "existing";
    domain?: "feishu" | "lark";
    appId?: string;
    appSecret?: string;
  }): Promise<ChannelLoginStartResult> {
    if (input.channel === "wechat") {
      const config = await this.getConfig();
      const result = await this.wechatLoginManager.startLogin({
        apiBaseUrl: config.channels.wechat.apiBaseUrl,
        botType: config.channels.wechat.botType,
        ...(input.force !== undefined ? { force: input.force } : {})
      });

      return {
        channel: "wechat",
        sessionKey: result.sessionKey,
        ...(result.qrDataUrl ? { qrDataUrl: result.qrDataUrl } : {}),
        message: result.message
      };
    }

    if (input.channel === "lark") {
      const result = await this.larkLoginManager.startLogin({
        mode: input.mode ?? "new",
        ...(input.force !== undefined ? { force: input.force } : {}),
        ...(input.domain ? { domain: input.domain } : {}),
        ...(input.appId ? { appId: input.appId } : {}),
        ...(input.appSecret ? { appSecret: input.appSecret } : {})
      });

      return {
        channel: "lark",
        sessionKey: result.sessionKey,
        ...(result.qrDataUrl ? { qrDataUrl: result.qrDataUrl } : {}),
        message: result.message
      };
    }

    throw new Error(`Unsupported login channel: ${input.channel}`);
  }

  async waitForLogin(input: {
    channel: string;
    sessionKey: string;
    timeoutMs?: number;
  }): Promise<ChannelLoginWaitResult> {
    if (input.channel === "wechat") {
      const result = await this.wechatLoginManager.waitForLogin({
        sessionKey: input.sessionKey,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {})
      });

      if (!result.connected || !result.token) {
        return {
          channel: "wechat",
          connected: false,
          message: result.message
        };
      }

      await this.wechatStateStore.replaceLoginState({
        token: result.token,
        ...(result.apiBaseUrl ? { apiBaseUrl: result.apiBaseUrl } : {}),
        ...(result.remoteAccountId ? { remoteAccountId: result.remoteAccountId } : {}),
        ...(result.userId ? { userId: result.userId } : {})
      });
      const loginPrincipalKey = result.userId?.trim();
      if (loginPrincipalKey) {
        await this.pairingService.approvePrincipal({
          channel: "wechat",
          accountId: "default",
          principalKey: loginPrincipalKey
        });
      }

      const config = await this.getConfig();
      if (!config.channels.wechat.enabled) {
        await this.configService.save({
          ...config,
          channels: {
            ...config.channels,
            wechat: {
              ...config.channels.wechat,
              enabled: true
            }
          }
        });
        await this.reloadConfig?.();
      } else {
        await this.onChannelCredentialsUpdated?.("wechat");
      }

      return {
        channel: "wechat",
        connected: true,
        message: result.message
      };
    }

    if (input.channel === "lark") {
      const result = await this.larkLoginManager.waitForLogin({
        sessionKey: input.sessionKey,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {})
      });

      if (!result.connected || !result.appId || !result.appSecret || !result.domain) {
        return {
          channel: "lark",
          connected: false,
          message: result.message
        };
      }

      const config = await this.getConfig();
      await this.configService.save({
        ...config,
        channels: {
          ...config.channels,
          lark: {
            ...config.channels.lark,
            enabled: true,
            appId: result.appId,
            appSecret: result.appSecret,
            domain: result.domain
          }
        }
      });

      const loginPrincipalKey = result.openId?.trim();
      if (loginPrincipalKey) {
        await this.pairingService.approvePrincipal({
          channel: "lark",
          accountId: "default",
          principalKey: loginPrincipalKey
        });
      }

      if (!config.channels.lark.enabled) {
        await this.reloadConfig?.();
      } else {
        await this.onChannelCredentialsUpdated?.("lark");
      }

      return {
        channel: "lark",
        connected: true,
        message: result.message
      };
    }

    throw new Error(`Unsupported login channel: ${input.channel}`);
  }
}
