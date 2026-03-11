import { describe, expect, it } from "vitest";
import { buildTelegramDirectSessionId } from "../src/session/stable-key.js";

describe("buildTelegramDirectSessionId", () => {
  it("uses the Phase 1 telegram direct format", () => {
    expect(
      buildTelegramDirectSessionId({
        channel: "telegram",
        accountId: "default",
        chatType: "direct",
        senderId: "42"
      })
    ).toBe("telegram:default:direct:42");
  });
});

