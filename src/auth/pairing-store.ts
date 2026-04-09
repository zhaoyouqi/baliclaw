import { readJson5FileOrDefault, writeJson5File } from "../config/file-store.js";
import {
  getAllowlistPairingFile,
  getAppPaths,
  getPendingPairingFile,
  type AppPaths
} from "../config/paths.js";
import type { PairingRequest } from "../shared/types.js";

export interface PairingStoreData {
  approvedPrincipalKeys: string[];
}

export interface PendingPairingStoreData {
  requests: PairingRequest[];
}

interface StoredPairingStoreData {
  approvedPrincipalKeys?: unknown;
}

interface StoredPendingPairingRequest {
  code?: unknown;
  principalKey?: unknown;
  username?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
}

interface StoredPendingPairingStoreData {
  requests?: unknown;
}

const defaultAllowlistData = (): PairingStoreData => ({
  approvedPrincipalKeys: []
});

const defaultPendingData = (): PendingPairingStoreData => ({
  requests: []
});

export class PairingStore {
  constructor(private readonly paths: AppPaths = getAppPaths()) {}

  async load(): Promise<PairingStoreData> {
    return this.loadAllowlist("telegram");
  }

  async save(data: PairingStoreData): Promise<void> {
    await this.saveAllowlist("telegram", data);
  }

  async loadAllowlist(channel = "telegram", accountId = "default"): Promise<PairingStoreData> {
    const stored = await readJson5FileOrDefault<StoredPairingStoreData>(
      getAllowlistPairingFile(this.paths, channel, accountId),
      {}
    );
    return normalizeAllowlistData(stored);
  }

  async saveAllowlist(
    channelOrData: string | PairingStoreData,
    maybeData?: PairingStoreData,
    accountId = "default"
  ): Promise<void> {
    const { channel, data } = normalizeAllowlistWriteInput(channelOrData, maybeData);
    await writeJson5File(getAllowlistPairingFile(this.paths, channel, accountId), {
      approvedPrincipalKeys: data.approvedPrincipalKeys
    });
  }

  async loadPendingRequests(channel = "telegram", accountId = "default"): Promise<PendingPairingStoreData> {
    const stored = await readJson5FileOrDefault<StoredPendingPairingStoreData>(
      getPendingPairingFile(this.paths, channel, accountId),
      {}
    );
    return normalizePendingData(stored, channel, accountId);
  }

  async savePendingRequests(
    channelOrData: string | PendingPairingStoreData,
    maybeData?: PendingPairingStoreData,
    accountId = "default"
  ): Promise<void> {
    const { channel, data } = normalizePendingWriteInput(channelOrData, maybeData);
    await writeJson5File(getPendingPairingFile(this.paths, channel, accountId), {
      requests: data.requests.map((request) => ({
        code: request.code,
        principalKey: request.principalKey,
        ...(request.username ? { username: request.username } : {}),
        createdAt: request.createdAt,
        expiresAt: request.expiresAt
      }))
    });
  }
}

function normalizeAllowlistData(raw: StoredPairingStoreData): PairingStoreData {
  if (!raw || !Array.isArray(raw.approvedPrincipalKeys)) {
    return defaultAllowlistData();
  }

  return {
    approvedPrincipalKeys: raw.approvedPrincipalKeys
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  };
}

function normalizePendingData(
  raw: StoredPendingPairingStoreData | undefined,
  channel: string,
  accountId: string
): PendingPairingStoreData {
  if (!raw || !Array.isArray(raw.requests)) {
    return defaultPendingData();
  }

  return {
    requests: raw.requests.flatMap((request) => normalizePendingRequest(request, channel, accountId))
  };
}

function normalizePendingRequest(
  raw: unknown,
  channel: string,
  accountId: string
): PairingRequest[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }

  const request = raw as StoredPendingPairingRequest;
  if (
    typeof request.code !== "string"
    || typeof request.principalKey !== "string"
    || typeof request.createdAt !== "string"
    || typeof request.expiresAt !== "string"
  ) {
    return [];
  }

  return [{
    channel,
    accountId,
    code: request.code,
    principalKey: request.principalKey,
    ...(typeof request.username === "string" ? { username: request.username } : {}),
    createdAt: request.createdAt,
    expiresAt: request.expiresAt
  }];
}

function normalizeAllowlistWriteInput(
  channelOrData: string | PairingStoreData,
  maybeData?: PairingStoreData
): { channel: string; data: PairingStoreData } {
  if (typeof channelOrData === "string") {
    return {
      channel: channelOrData,
      data: maybeData ?? defaultAllowlistData()
    };
  }

  return {
    channel: "telegram",
    data: channelOrData
  };
}

function normalizePendingWriteInput(
  channelOrData: string | PendingPairingStoreData,
  maybeData?: PendingPairingStoreData
): { channel: string; data: PendingPairingStoreData } {
  if (typeof channelOrData === "string") {
    return {
      channel: channelOrData,
      data: maybeData ?? defaultPendingData()
    };
  }

  return {
    channel: "telegram",
    data: channelOrData
  };
}
