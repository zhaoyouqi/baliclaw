import { describe, expect, it, vi } from "vitest";
import {
  runPairingApproveCommand,
  runPairingListCommand
} from "../src/cli/commands/pairing.js";

const pendingRequest = {
  channel: "telegram",
  accountId: "default",
  code: "ABCD2345",
  principalKey: "42",
  username: "alice",
  createdAt: "2026-03-23T09:00:00.000Z",
  expiresAt: "2026-03-23T10:00:00.000Z"
} as const;

describe("CLI pairing commands", () => {
  it("lists pending pairing requests through IPC", async () => {
    const client = {
      listPairingRequests: vi.fn().mockResolvedValue([pendingRequest])
    } as never;

    await expect(runPairingListCommand("telegram", client)).resolves.toBe(
      JSON.stringify([pendingRequest], null, 2)
    );
    expect(client.listPairingRequests).toHaveBeenCalledWith("telegram");
  });

  it("approves a pairing code through IPC", async () => {
    const client = {
      approvePairingCode: vi.fn().mockResolvedValue(pendingRequest)
    } as never;

    await expect(runPairingApproveCommand("telegram", "ABCD2345", client)).resolves.toBe(
      JSON.stringify(pendingRequest, null, 2)
    );
    expect(client.approvePairingCode).toHaveBeenCalledWith("telegram", "ABCD2345");
  });

  it("passes through arbitrary pairing channels to IPC", async () => {
    const client = {
      listPairingRequests: vi.fn().mockResolvedValue([])
    } as never;

    await expect(runPairingListCommand("slack", client)).resolves.toBe("[]");
    expect(client.listPairingRequests).toHaveBeenCalledWith("slack");
  });
});
