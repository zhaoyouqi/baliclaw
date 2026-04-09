import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PairingStore } from "../src/auth/pairing-store.js";
import { getAppPaths } from "../src/config/paths.js";

describe("PairingStore", () => {
  it("returns default pending requests and allowlist when files are missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-defaults-"));
    const store = new PairingStore(getAppPaths(home));

    try {
      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: []
      });
      await expect(store.loadAllowlist()).resolves.toEqual({
        approvedPrincipalKeys: []
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("persists pending requests and approved sender ids in separate files", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-persist-"));
    const paths = getAppPaths(home);
    const store = new PairingStore(paths);

    try {
      await store.savePendingRequests({
        requests: [
          {
            channel: "telegram",
            accountId: "default",
            code: "ABCD2345",
            principalKey: "12345",
            username: "alice",
            createdAt: "2026-03-22T10:00:00.000Z",
            expiresAt: "2026-03-22T11:00:00.000Z"
          }
        ]
      });
      await store.saveAllowlist({
        approvedPrincipalKeys: ["12345", "67890"]
      });

      await expect(store.loadPendingRequests()).resolves.toEqual({
        requests: [
          {
            channel: "telegram",
            accountId: "default",
            code: "ABCD2345",
            principalKey: "12345",
            username: "alice",
            createdAt: "2026-03-22T10:00:00.000Z",
            expiresAt: "2026-03-22T11:00:00.000Z"
          }
        ]
      });
      await expect(store.loadAllowlist()).resolves.toEqual({
        approvedPrincipalKeys: ["12345", "67890"]
      });

      await expect(readFile(paths.pendingPairingFile, "utf8")).resolves.toContain("'ABCD2345'");
      await expect(readFile(paths.allowlistFile, "utf8")).resolves.toContain("'67890'");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("rewrites store files atomically without leaving temp files behind", async () => {
    const home = await mkdtemp(join(tmpdir(), "baliclaw-pairing-atomic-"));
    const paths = getAppPaths(home);
    const store = new PairingStore(paths);

    try {
      await store.savePendingRequests({
        requests: [
          {
            channel: "telegram",
            accountId: "default",
            code: "FIRST111",
            principalKey: "111",
            createdAt: "2026-03-22T10:00:00.000Z",
            expiresAt: "2026-03-22T11:00:00.000Z"
          }
        ]
      });
      await store.savePendingRequests({
        requests: [
          {
            channel: "telegram",
            accountId: "default",
            code: "SECOND22",
            principalKey: "222",
            createdAt: "2026-03-22T12:00:00.000Z",
            expiresAt: "2026-03-22T13:00:00.000Z"
          }
        ]
      });
      await store.saveAllowlist({
        approvedPrincipalKeys: ["222"]
      });
      await store.saveAllowlist({
        approvedPrincipalKeys: ["333"]
      });

      await expect(readFile(paths.pendingPairingFile, "utf8")).resolves.toContain("'SECOND22'");
      await expect(readFile(paths.allowlistFile, "utf8")).resolves.toContain("'333'");
      await expect(readdir(paths.pairingDir).then((entries) => entries.sort())).resolves.toEqual([
        "telegram"
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
