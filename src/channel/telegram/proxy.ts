import type { ApiClientOptions } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";

export function createTelegramClientOptions(): ApiClientOptions {
  const proxyUrl = getTelegramProxyUrl();

  if (!proxyUrl) {
    return {};
  }

  return {
    baseFetchConfig: {
      agent: new HttpsProxyAgent(proxyUrl),
      compress: true
    }
  };
}

function getTelegramProxyUrl(): string | null {
  const raw = process.env.https_proxy
    ?? process.env.HTTPS_PROXY
    ?? process.env.http_proxy
    ?? process.env.HTTP_PROXY;

  if (!raw || raw.trim().length === 0) {
    return null;
  }

  return raw;
}
