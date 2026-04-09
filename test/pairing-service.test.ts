import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PairingService } from "../src/auth/pairing-service.js";
import { PairingStore } from "../src/auth/pairing-store.js";
import { getAppPaths } from "../src/config/paths.js";

describe("PairingService", () => {
  it("creates a pending pairing code for an unauthorized sender", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-service-create-"));
    const store = new PairingStore(getAppPaths(home));
    const service = new PairingService(store);
    const now = new Date("2026-03-22T10:00:00.000Z");

    try {
      const request = await service.getOrCreatePendingRequest({
        channel: "telegram",
        principalKey: "12345",
        username: "alice",
        now
      });

      expect(request.principalKey).toBe("12345");
      expect(request.username).toBe("alice");
      expect(request.code).toMatch(/^[A-Z2-9]{8}$/);
      expect(request.code).not.toMatch(/[IO01]/);
      expect(request.createdAt).toBe("2026-03-22T10:00:00.000Z");
      expect(request.expiresAt).toBe("2026-03-22T11:00:00.000Z");
      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: [request]
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reuses an active pairing code for the same sender", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-service-reuse-"));
    const store = new PairingStore(getAppPaths(home));
    const service = new PairingService(store);
    const now = new Date("2026-03-22T10:00:00.000Z");

    try {
      const first = await service.getOrCreatePendingRequest({
        channel: "telegram",
        principalKey: "12345",
        username: "alice",
        now
      });
      const second = await service.getOrCreatePendingRequest({
        channel: "telegram",
        principalKey: "12345",
        username: "alice-updated",
        now: new Date("2026-03-22T10:10:00.000Z")
      });

      expect(second).toEqual(first);
      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: [first]
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("approves a valid code, adds the sender to allowlist, and removes the pending request", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-service-approve-"));
    const store = new PairingStore(getAppPaths(home));
    const service = new PairingService(store);
    const now = new Date("2026-03-22T10:00:00.000Z");

    try {
      const request = await service.getOrCreatePendingRequest({
        channel: "telegram",
        principalKey: "12345",
        username: "alice",
        now
      });
      const approved = await service.approve("telegram", request.code, new Date("2026-03-22T10:30:00.000Z"));

      expect(approved).toEqual(request);
      await expect(service.isApprovedPrincipal({
        channel: "telegram",
        principalKey: "12345"
      })).resolves.toBe(true);
      await expect(store.loadAllowlist()).resolves.toEqual({
        approvedPrincipalKeys: ["12345"]
      });
      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: []
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("rejects expired pairing codes and prunes them from pending storage", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-service-expired-"));
    const store = new PairingStore(getAppPaths(home));
    const service = new PairingService(store);

    try {
      await store.savePendingRequests({
        requests: [
          {
            channel: "telegram",
            accountId: "default",
            code: "ABCDEFGH",
            principalKey: "12345",
            createdAt: "2026-03-22T10:00:00.000Z",
            expiresAt: "2026-03-22T11:00:00.000Z"
          }
        ]
      });

      await expect(
        service.approve("telegram", "abcdefgh", new Date("2026-03-22T11:00:01.000Z"))
      ).rejects.toThrow("Pairing code is invalid or expired");
      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: []
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("enforces the maximum number of active pending requests", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-service-max-"));
    const store = new PairingStore(getAppPaths(home));
    const service = new PairingService(store);
    const now = new Date("2026-03-22T10:00:00.000Z");

    try {
      await service.getOrCreatePendingRequest({ channel: "telegram", principalKey: "1", now });
      await service.getOrCreatePendingRequest({ channel: "telegram", principalKey: "2", now });
      await service.getOrCreatePendingRequest({ channel: "telegram", principalKey: "3", now });

      await expect(
        service.getOrCreatePendingRequest({ channel: "telegram", principalKey: "4", now })
      ).rejects.toThrow("Maximum pending pairing requests reached");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
