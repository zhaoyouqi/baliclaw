import crypto from "node:crypto";
import { APP_VERSION } from "../../shared/version.js";
import type {
  BaseInfo,
  GetConfigResp,
  GetUpdatesReq,
  GetUpdatesResp,
  QrCodeResponse,
  QrStatusResponse,
  SendMessageReq,
  SendTypingReq
} from "./types.js";

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_LIGHTWEIGHT_TIMEOUT_MS = 10_000;

export interface WeChatApiOptions {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs?: number | undefined;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildBaseInfo(): BaseInfo {
  return {
    channel_version: APP_VERSION
  };
}

function buildClientVersion(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((segment) => Number.parseInt(segment, 10) || 0);
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

function randomWechatUin(): string {
  const value = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(value), "utf8").toString("base64");
}

function buildHeaders(body: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...buildCommonHeaders(),
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body, "utf8")),
    AuthorizationType: "ilink_bot_token"
  };

  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  return headers;
}

function buildCommonHeaders(): Record<string, string> {
  return {
    "X-WECHAT-UIN": randomWechatUin(),
    "iLink-App-ClientVersion": String(buildClientVersion(APP_VERSION))
  };
}

async function getJson<T>(params: {
  baseUrl: string;
  endpoint: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_LIGHTWEIGHT_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(params.endpoint, ensureTrailingSlash(params.baseUrl)), {
      method: "GET",
      headers: buildCommonHeaders(),
      signal: params.signal ? AbortSignal.any([controller.signal, params.signal]) : controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${params.endpoint} ${response.status}: ${text}`);
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function postJson<T>(params: {
  baseUrl: string;
  endpoint: string;
  body: unknown;
  token?: string | undefined;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs);
  const serializedBody = JSON.stringify(params.body);

  try {
    const response = await fetch(new URL(params.endpoint, ensureTrailingSlash(params.baseUrl)), {
      method: "POST",
      headers: buildHeaders(serializedBody, params.token),
      body: serializedBody,
      signal: params.signal ? AbortSignal.any([controller.signal, params.signal]) : controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${params.endpoint} ${response.status}: ${text}`);
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function fetchQrCode(params: {
  baseUrl: string;
  botType: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<QrCodeResponse> {
  return await getJson<QrCodeResponse>({
    baseUrl: params.baseUrl,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(params.botType)}`,
    timeoutMs: params.timeoutMs,
    signal: params.signal
  });
}

export async function pollQrStatus(params: {
  baseUrl: string;
  qrcode: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<QrStatusResponse> {
  try {
    return await getJson<QrStatusResponse>({
      baseUrl: params.baseUrl,
      endpoint: `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(params.qrcode)}`,
      timeoutMs: params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
      signal: params.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "wait" };
    }

    throw error;
  }
}

export async function getUpdates(
  params: GetUpdatesReq & {
    baseUrl: string;
    token?: string | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }
): Promise<GetUpdatesResp> {
  try {
    return await postJson<GetUpdatesResp>({
      baseUrl: params.baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: {
        get_updates_buf: params.get_updates_buf ?? "",
        base_info: buildBaseInfo()
      },
      token: params.token,
      timeoutMs: params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
      signal: params.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ret: 0,
        msgs: [],
        get_updates_buf: params.get_updates_buf ?? ""
      };
    }

    throw error;
  }
}

export async function sendMessage(
  params: WeChatApiOptions & {
    body: SendMessageReq;
    signal?: AbortSignal | undefined;
  }
): Promise<void> {
  await postJson<Record<string, never>>({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: {
      ...params.body,
      base_info: buildBaseInfo()
    },
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    signal: params.signal
  });
}

export async function getConfig(
  params: WeChatApiOptions & {
    ilinkUserId: string;
    contextToken?: string | undefined;
    signal?: AbortSignal | undefined;
  }
): Promise<GetConfigResp> {
  return await postJson<GetConfigResp>({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/getconfig",
    body: {
      ilink_user_id: params.ilinkUserId,
      context_token: params.contextToken,
      base_info: buildBaseInfo()
    },
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_LIGHTWEIGHT_TIMEOUT_MS,
    signal: params.signal
  });
}

export async function sendTyping(
  params: WeChatApiOptions & {
    body: SendTypingReq;
    signal?: AbortSignal | undefined;
  }
): Promise<void> {
  await postJson<Record<string, never>>({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendtyping",
    body: {
      ...params.body,
      base_info: buildBaseInfo()
    },
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_LIGHTWEIGHT_TIMEOUT_MS,
    signal: params.signal
  });
}
