import { randomInt } from "node:crypto";
import type { PairingRequest } from "../shared/types.js";
import { PairingStore } from "./pairing-store.js";

const pairingCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairingCodeLength = 8;
const pairingTtlMs = 60 * 60 * 1000;
const maxPendingRequests = 3;

export interface CreatePairingRequestInput {
  channel: string;
  accountId?: string;
  principalKey: string;
  username?: string;
  now?: Date;
}

export class PairingService {
  constructor(private readonly store = new PairingStore()) {}

  async listPendingRequests(channel = "telegram", now = new Date(), accountId = "default"): Promise<PairingRequest[]> {
    const pending = await this.store.loadPendingRequests(channel, accountId);
    const activeRequests = pruneExpiredRequests(pending.requests, now);

    if (activeRequests.length !== pending.requests.length) {
      await this.store.savePendingRequests(channel, { requests: activeRequests }, accountId);
    }

    return activeRequests;
  }

  async listApprovedPrincipals(channel = "telegram", accountId = "default"): Promise<string[]> {
    const data = await this.store.loadAllowlist(channel, accountId);
    return data.approvedPrincipalKeys;
  }

  async isApprovedPrincipal(input: { channel: string; accountId?: string; principalKey: string }): Promise<boolean> {
    const accountId = input.accountId ?? "default";
    const data = await this.store.loadAllowlist(input.channel, accountId);
    return data.approvedPrincipalKeys.includes(input.principalKey);
  }

  async getOrCreatePendingRequest(input: CreatePairingRequestInput): Promise<PairingRequest> {
    const accountId = input.accountId ?? "default";
    const now = input.now ?? new Date();
    const pending = await this.store.loadPendingRequests(input.channel, accountId);
    const activeRequests = pruneExpiredRequests(pending.requests, now);
    const existing = activeRequests.find((request) => request.principalKey === input.principalKey);

    if (existing) {
      if (activeRequests.length !== pending.requests.length) {
        await this.store.savePendingRequests(input.channel, { requests: activeRequests }, accountId);
      }

      return existing;
    }

    if (activeRequests.length >= maxPendingRequests) {
      throw new Error("Maximum pending pairing requests reached");
    }

    const request = createPairingRequest(
      input.channel,
      accountId,
      input.principalKey,
      input.username,
      now,
      activeRequests
    );
    activeRequests.push(request);
    await this.store.savePendingRequests(input.channel, { requests: activeRequests }, accountId);
    return request;
  }

  async approve(channel: string, code: string, now = new Date(), accountId = "default"): Promise<PairingRequest> {
    const normalizedCode = code.trim().toUpperCase();
    const pending = await this.store.loadPendingRequests(channel, accountId);
    const allowlist = await this.store.loadAllowlist(channel, accountId);
    const activeRequests = pruneExpiredRequests(pending.requests, now);
    const approved = activeRequests.find((request) => request.code === normalizedCode);

    if (!approved) {
      if (activeRequests.length !== pending.requests.length) {
        await this.store.savePendingRequests(channel, { requests: activeRequests }, accountId);
      }

      throw new Error("Pairing code is invalid or expired");
    }

    const remainingRequests = activeRequests.filter((request) => request.code !== normalizedCode);
    const approvedPrincipalKeys = allowlist.approvedPrincipalKeys.includes(approved.principalKey)
      ? allowlist.approvedPrincipalKeys
      : [...allowlist.approvedPrincipalKeys, approved.principalKey];

    await this.store.saveAllowlist(channel, { approvedPrincipalKeys }, accountId);
    await this.store.savePendingRequests(channel, { requests: remainingRequests }, accountId);
    return approved;
  }

  async pruneExpiredRequests(channel = "telegram", now = new Date(), accountId = "default"): Promise<void> {
    const pending = await this.store.loadPendingRequests(channel, accountId);
    const activeRequests = pruneExpiredRequests(pending.requests, now);

    if (activeRequests.length !== pending.requests.length) {
      await this.store.savePendingRequests(channel, { requests: activeRequests }, accountId);
    }
  }
}

function createPairingRequest(
  channel: string,
  accountId: string,
  principalKey: string,
  username: string | undefined,
  now: Date,
  existingRequests: PairingRequest[]
): PairingRequest {
  const request: PairingRequest = {
    channel,
    accountId,
    code: generateUniquePairingCode(existingRequests),
    principalKey,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + pairingTtlMs).toISOString()
  };

  if (username) {
    request.username = username;
  }

  return request;
}

function generateUniquePairingCode(existingRequests: PairingRequest[]): string {
  const existingCodes = new Set(existingRequests.map((request) => request.code));

  while (true) {
    const code = Array.from({ length: pairingCodeLength }, () =>
      pairingCodeAlphabet[randomInt(0, pairingCodeAlphabet.length)]
    ).join("");

    if (!existingCodes.has(code)) {
      return code;
    }
  }
}

function pruneExpiredRequests(requests: PairingRequest[], now: Date): PairingRequest[] {
  return requests.filter((request) => new Date(request.expiresAt).getTime() > now.getTime());
}
