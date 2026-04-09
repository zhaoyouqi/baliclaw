import { randomUUID } from "node:crypto";

const ACTIVE_LOGIN_TTL_MS = 10 * 60_000;
const DEFAULT_WAIT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export type LarkDomain = "feishu" | "lark";
export type LarkLoginMode = "new" | "existing";

interface LarkRegistrationBeginResponse {
  device_code?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

interface LarkRegistrationPollResponse {
  error?: string;
  error_description?: string;
  client_id?: string;
  client_secret?: string;
  tenant_brand?: string;
  user_info?: {
    open_id?: string;
  };
}

interface ActiveNewLogin {
  kind: "new";
  sessionKey: string;
  domain: LarkDomain;
  qrDataUrl: string;
  deviceCode: string;
  startedAt: number;
  expiresAt: number;
  pollIntervalMs: number;
}

interface ActiveExistingLogin {
  kind: "existing";
  sessionKey: string;
  domain: LarkDomain;
  appId: string;
  appSecret: string;
  startedAt: number;
}

type ActiveLogin = ActiveNewLogin | ActiveExistingLogin;

export interface LarkLoginStartResult {
  sessionKey: string;
  qrDataUrl?: string;
  message: string;
}

export interface LarkLoginWaitResult {
  connected: boolean;
  message: string;
  appId?: string;
  appSecret?: string;
  domain?: LarkDomain;
  openId?: string;
}

export class LarkLoginManager {
  private readonly activeLogins = new Map<string, ActiveLogin>();

  constructor(
    private readonly fetchJsonImpl: typeof fetchJson = fetchJson,
    private readonly now = () => Date.now()
  ) {}

  async startLogin(input: {
    mode: LarkLoginMode;
    sessionKey?: string;
    force?: boolean;
    domain?: LarkDomain;
    appId?: string;
    appSecret?: string;
  }): Promise<LarkLoginStartResult> {
    this.purgeExpiredLogins();

    const sessionKey = input.sessionKey ?? randomUUID();
    const existing = this.activeLogins.get(sessionKey);

    if (input.mode === "existing") {
      const domain = requireDomain(input.domain);
      const appId = requireValue(input.appId, "appId");
      const appSecret = requireValue(input.appSecret, "appSecret");

      await validateExistingCredentials(this.fetchJsonImpl, {
        domain,
        appId,
        appSecret
      });

      this.activeLogins.set(sessionKey, {
        kind: "existing",
        sessionKey,
        domain,
        appId,
        appSecret,
        startedAt: this.now()
      });

      return {
        sessionKey,
        message: "Validated existing Lark app credentials."
      };
    }

    if (!input.force && existing?.kind === "new" && this.isFresh(existing)) {
      return {
        sessionKey,
        qrDataUrl: existing.qrDataUrl,
        message: "Open the URL and complete the Lark authorization flow."
      };
    }

    const initialDomain = input.domain ?? "feishu";
    await postRegistrationAction(this.fetchJsonImpl, initialDomain, { action: "init" });
    const begin = await postRegistrationAction<LarkRegistrationBeginResponse>(this.fetchJsonImpl, initialDomain, {
      action: "begin",
      archetype: "PersonalAgent",
      auth_method: "client_secret",
      request_user_info: "open_id"
    });

    const deviceCode = begin.device_code?.trim();
    const qrDataUrl = begin.verification_uri_complete?.trim();
    if (!deviceCode || !qrDataUrl) {
      return {
        sessionKey,
        message: "Failed to create a Lark authorization session."
      };
    }

    const expiresInMs = Math.max(30_000, (begin.expires_in ?? 300) * 1000);
    this.activeLogins.set(sessionKey, {
      kind: "new",
      sessionKey,
      domain: initialDomain,
      qrDataUrl,
      deviceCode,
      startedAt: this.now(),
      expiresAt: this.now() + expiresInMs,
      pollIntervalMs: Math.max(DEFAULT_POLL_INTERVAL_MS, (begin.interval ?? 2) * 1000)
    });

    return {
      sessionKey,
      qrDataUrl,
      message: "Open the URL and complete the Lark authorization flow."
    };
  }

  async waitForLogin(input: {
    sessionKey: string;
    timeoutMs?: number;
  }): Promise<LarkLoginWaitResult> {
    const login = this.activeLogins.get(input.sessionKey);
    if (!login) {
      return {
        connected: false,
        message: "No active Lark login session exists."
      };
    }

    if (!this.isFresh(login)) {
      this.activeLogins.delete(input.sessionKey);
      return {
        connected: false,
        message: "The Lark login session has expired. Start login again."
      };
    }

    if (login.kind === "existing") {
      this.activeLogins.delete(input.sessionKey);
      return {
        connected: true,
        message: "Lark credentials saved.",
        appId: login.appId,
        appSecret: login.appSecret,
        domain: login.domain
      };
    }

    const deadline = Math.min(
      login.expiresAt,
      this.now() + Math.max(1_000, input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    );

    while (this.now() < deadline) {
      const poll = await postRegistrationAction<LarkRegistrationPollResponse>(this.fetchJsonImpl, login.domain, {
        action: "poll",
        device_code: login.deviceCode
      });

      const completedAppId = poll.client_id?.trim();
      const completedAppSecret = poll.client_secret?.trim();
      if (completedAppId && completedAppSecret) {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: true,
          message: "Lark login completed.",
          appId: completedAppId,
          appSecret: completedAppSecret,
          domain: normalizeTenantBrand(poll.tenant_brand, login.domain),
          ...(poll.user_info?.open_id?.trim() ? { openId: poll.user_info.open_id.trim() } : {})
        };
      }

      const error = poll.error?.trim();
      if (error === "authorization_pending") {
        await sleep(login.pollIntervalMs);
        continue;
      }
      if (error === "slow_down") {
        login.pollIntervalMs += 1_000;
        await sleep(login.pollIntervalMs);
        continue;
      }
      if (error === "access_denied") {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: false,
          message: poll.error_description?.trim() || "Lark authorization was denied."
        };
      }
      if (error === "expired_token") {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: false,
          message: "The Lark authorization URL expired before login completed."
        };
      }
      if (error) {
        this.activeLogins.delete(input.sessionKey);
        return {
          connected: false,
          message: poll.error_description?.trim() || `Lark login failed: ${error}`
        };
      }

      await sleep(login.pollIntervalMs);
    }

    this.activeLogins.delete(input.sessionKey);
    return {
      connected: false,
      message: "Timed out while waiting for Lark login confirmation."
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
    if (login.kind === "new") {
      return this.now() < login.expiresAt;
    }

    return this.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
  }
}

function normalizeTenantBrand(tenantBrand: string | undefined, fallback: LarkDomain): LarkDomain {
  return tenantBrand === "lark" ? "lark" : fallback;
}

function requireDomain(domain: LarkDomain | undefined): LarkDomain {
  if (domain === "feishu" || domain === "lark") {
    return domain;
  }

  throw new Error("domain is required for existing Lark login");
}

function requireValue(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (normalized) {
    return normalized;
  }

  throw new Error(`${field} is required for existing Lark login`);
}

function accountsBaseUrl(domain: LarkDomain): string {
  return domain === "lark" ? "https://accounts.larksuite.com" : "https://accounts.feishu.cn";
}

function openBaseUrl(domain: LarkDomain): string {
  return domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}

async function validateExistingCredentials(
  fetchJsonImpl: typeof fetchJson,
  input: { domain: LarkDomain; appId: string; appSecret: string }
): Promise<void> {
  const response = await fetchJsonImpl(`${openBaseUrl(input.domain)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    body: {
      app_id: input.appId,
      app_secret: input.appSecret
    }
  });

  if (response.code !== 0 || typeof response.tenant_access_token !== "string") {
    throw new Error(
      typeof response.msg === "string" && response.msg.trim().length > 0
        ? response.msg
        : "Invalid Lark app credentials"
    );
  }
}

async function postRegistrationAction<T extends object = Record<string, unknown>>(
  fetchJsonImpl: typeof fetchJson,
  domain: LarkDomain,
  body: Record<string, unknown>
): Promise<T> {
  return await fetchJsonImpl(`${accountsBaseUrl(domain)}/oauth/v1/app/registration`, {
    method: "POST",
    body
  }) as T;
}

async function fetchJson(
  url: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const requestInit: RequestInit = {
    method: init.method
  };
  if (init.body) {
    requestInit.headers = { "content-type": "application/json" };
    requestInit.body = JSON.stringify(init.body);
  }

  const response = await fetch(url, requestInit);

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = text.trim().length === 0 ? {} : JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Lark API returned invalid JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(
      typeof data.msg === "string"
        ? data.msg
        : typeof data.error_description === "string"
          ? data.error_description
          : `Lark API request failed (${response.status})`
    );
  }

  return data;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
