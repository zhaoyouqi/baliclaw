import { describe, expect, it } from "vitest";
import { normalizeWeChatMessage } from "../src/channel/wechat/normalize.js";
import { MessageItemType } from "../src/channel/wechat/types.js";

describe("normalizeWeChatMessage", () => {
  it("normalizes a direct text message into an inbound envelope", () => {
    expect(normalizeWeChatMessage({
      from_user_id: "wx-user-1",
      message_id: 99,
      item_list: [{
        type: MessageItemType.TEXT,
        text_item: {
          text: "hello from wechat"
        }
      }]
    })).toEqual({
      message: {
        channel: "wechat",
        accountId: "default",
        chatType: "direct",
        conversationId: "wx-user-1",
        senderId: "wx-user-1",
        messageId: "99",
        text: "hello from wechat"
      },
      deliveryTarget: {
        channel: "wechat",
        accountId: "default",
        chatType: "direct",
        conversationId: "wx-user-1"
      },
      sessionKey: "wechat:default:direct:wx-user-1",
      principalKey: "wx-user-1"
    });
  });

  it("uses a voice transcript when no text item exists", () => {
    expect(normalizeWeChatMessage({
      from_user_id: "wx-user-2",
      item_list: [{
        type: MessageItemType.VOICE,
        voice_item: {
          text: "voice transcript"
        }
      }]
    })?.message.text).toBe("voice transcript");
  });

  it("ignores messages without usable text", () => {
    expect(normalizeWeChatMessage({
      from_user_id: "wx-user-3",
      item_list: [{
        type: MessageItemType.IMAGE
      }]
    })).toBeNull();
  });
});
