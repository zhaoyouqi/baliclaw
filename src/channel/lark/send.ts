import * as Lark from "@larksuiteoapi/node-sdk";
import type { DeliveryTarget } from "../../shared/types.js";
import type { LarkDomain } from "./login.js";

export function createLarkClient(input: {
  appId: string;
  appSecret: string;
  domain: LarkDomain;
}): Lark.Client {
  return new Lark.Client({
    appId: input.appId,
    appSecret: input.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: toLarkSdkDomain(input.domain)
  });
}

export async function sendLarkText(
  target: DeliveryTarget,
  text: string,
  client: Pick<Lark.Client, "im">
): Promise<void> {
  await client.im.message.create({
    params: {
      receive_id_type: "chat_id"
    },
    data: {
      receive_id: target.conversationId,
      msg_type: "text",
      content: JSON.stringify({ text })
    }
  });
}

export function toLarkSdkDomain(domain: LarkDomain): Lark.Domain {
  return domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu;
}
